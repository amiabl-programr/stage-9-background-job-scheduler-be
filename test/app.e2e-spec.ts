import { Test, TestingModule } from '@nestjs/testing';
import {
  INestApplication,
  ValidationPipe,
  UnprocessableEntityException,
} from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { DataSource } from 'typeorm';
import { Job } from '../src/modules/jobs/entities/job.entity';
import { DeadLetterEntry } from '../src/modules/dead-letter/entities/dead-letter-entry.entity';

describe('Background Job Scheduler (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let jobId: string;
  let dlqEntryId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1', { exclude: ['health'] });
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        exceptionFactory: (errors) =>
          new UnprocessableEntityException(
            errors.map((e) => ({
              property: e.property,
              constraints: e.constraints,
            })),
          ),
      }),
    );

    await app.init();
    dataSource = app.get(DataSource);
  });

  afterAll(async () => {
    // Clean up test data
    const jobRepo = dataSource.getRepository(Job);
    const dlqRepo = dataSource.getRepository(DeadLetterEntry);

    if (jobId) await jobRepo.delete(jobId);
    // Clean up any jobs created during tests
    await jobRepo.delete({ type: 'send_email' });

    const entries = await dlqRepo.find();
    for (const e of entries) {
      if (e.jobSnapshot && typeof e.jobSnapshot === 'object') {
        const snapshot = e.jobSnapshot as Record<string, unknown>;
        const snapshotId = snapshot.id as string;
        if (snapshotId) await jobRepo.delete(snapshotId).catch(() => {});
      }
    }
    await dlqRepo.delete({});
    await jobRepo.delete({});

    await app.close();
  });

  // ─── Health ─────────────────────────────────────────────

  describe('GET /api/health', () => {
    it('returns 200 with status ok', () => {
      return request(app.getHttpServer())
        .get('/api/health')
        .expect(200)
        .expect((res) => {
          expect(res.body.status).toBe('ok');
          expect(res.body.timestamp).toBeDefined();
        });
    });
  });

  // ─── Create Job ──────────────────────────────────────────

  describe('POST /api/v1/jobs', () => {
    it('creates a job and returns 201', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/jobs')
        .send({
          type: 'send_email',
          payload: { to: 'test@example.com', subject: 'Test' },
          priority: 1,
        })
        .expect(201);

      expect(res.body.id).toBeDefined();
      expect(res.body.type).toBe('send_email');
      expect(res.body.status).toBe('pending');
      expect(res.body.priority).toBe(1);
      expect(res.body.retryCount).toBe(0);
      expect(res.body.lastError).toBeNull();
      expect(res.body.dependsOn).toEqual([]);

      jobId = res.body.id;
    });

    it('creates a scheduled job with recurringInterval', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/jobs')
        .send({
          type: 'send_email',
          payload: { to: 'test@example.com', subject: 'Recurring' },
          recurringInterval: 'every_1_minute',
          scheduledAt: new Date(Date.now() + 3600000).toISOString(),
        })
        .expect(201);

      expect(res.body.recurringInterval).toBe('every_1_minute');
      expect(res.body.scheduledAt).toBeDefined();
    });

    it('returns 422 when required field is missing', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/jobs')
        .send({ payload: {} })
        .expect(422);

      expect(res.body.message).toBeDefined();
      expect(Array.isArray(res.body.message)).toBe(true);
    });

    it('returns 422 when payload is not an object', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/jobs')
        .send({ type: 'send_email', payload: 'not-an-object' })
        .expect(422);
    });

    it('returns 422 for unknown priority enum value', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/jobs')
        .send({ type: 'send_email', payload: {}, priority: 99 })
        .expect(422);
    });

    it('creates a job with dependsOn (DAG)', async () => {
      // First create a completed job as dependency
      const parent = await request(app.getHttpServer())
        .post('/api/v1/jobs')
        .send({
          type: 'send_email',
          payload: { to: 'dep@test.com', subject: 'Parent' },
        })
        .expect(201);

      // Manually mark it completed
      await dataSource
        .getRepository(Job)
        .update(parent.body.id, { status: 'completed' });

      const res = await request(app.getHttpServer())
        .post('/api/v1/jobs')
        .send({
          type: 'send_email',
          payload: { to: 'dep@test.com', subject: 'Child' },
          dependsOn: [parent.body.id],
        })
        .expect(201);

      expect(res.body.dependsOn).toEqual([parent.body.id]);
    });
  });

  // ─── List Jobs ──────────────────────────────────────────

  describe('GET /api/v1/jobs', () => {
    it('returns paginated jobs', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/jobs')
        .expect(200);

      expect(res.body.data).toBeDefined();
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.total).toBeGreaterThanOrEqual(1);
      expect(res.body.page).toBe(1);
      expect(res.body.limit).toBe(20);
    });

    it('filters by status', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/jobs?status=pending')
        .expect(200);

      for (const job of res.body.data) {
        expect(job.status).toBe('pending');
      }
    });

    it('filters by type', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/jobs?type=send_email')
        .expect(200);
    });

    it('returns 422 for invalid status filter', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/jobs?status=invalid_status')
        .expect(422);
    });
  });

  // ─── Get Single Job ─────────────────────────────────────

  describe('GET /api/v1/jobs/:id', () => {
    it('returns a job by id', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/jobs/${jobId}`)
        .expect(200);

      expect(res.body.id).toBe(jobId);
    });

    it('returns 404 for non-existent job', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/jobs/00000000-0000-0000-0000-000000000000')
        .expect(404);
    });
  });

  // ─── Update Job ─────────────────────────────────────────

  describe('PATCH /api/v1/jobs/:id', () => {
    it('updates a job priority', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/jobs/${jobId}`)
        .send({ priority: 3 })
        .expect(200);

      expect(res.body.priority).toBe(3);
    });

    it('returns 422 for invalid status value', async () => {
      await request(app.getHttpServer())
        .patch(`/api/v1/jobs/${jobId}`)
        .send({ status: 'nonexistent_status' })
        .expect(422);
    });

    it('returns 404 for non-existent job', async () => {
      await request(app.getHttpServer())
        .patch('/api/v1/jobs/00000000-0000-0000-0000-000000000000')
        .send({ priority: 2 })
        .expect(404);
    });
  });

  // ─── Cancel Job ──────────────────────────────────────────

  describe('PATCH /api/v1/jobs/:id/cancel', () => {
    let cancellableJobId: string;

    it('cancels a pending job', async () => {
      const job = await request(app.getHttpServer())
        .post('/api/v1/jobs')
        .send({
          type: 'send_email',
          payload: { to: 'cancel@test.com', subject: 'Cancel' },
        })
        .expect(201);

      cancellableJobId = job.body.id;

      const res = await request(app.getHttpServer())
        .patch(`/api/v1/jobs/${cancellableJobId}/cancel`)
        .expect(200);

      expect(res.body.status).toBe('cancelled');
    });

    it('returns 409 when cancelling an already cancelled job', async () => {
      await request(app.getHttpServer())
        .patch(`/api/v1/jobs/${cancellableJobId}/cancel`)
        .expect(409);
    });

    it('returns 409 when cancelling a completed job', async () => {
      // Create and complete a job
      const job = await request(app.getHttpServer())
        .post('/api/v1/jobs')
        .send({
          type: 'send_email',
          payload: { to: 'complete@test.com', subject: 'Complete' },
        })
        .expect(201);

      await dataSource.getRepository(Job).update(job.body.id, {
        status: 'completed',
        completedAt: new Date(),
      });

      await request(app.getHttpServer())
        .patch(`/api/v1/jobs/${job.body.id}/cancel`)
        .expect(409);
    });
  });

  // ─── Delete Job ──────────────────────────────────────────

  describe('DELETE /api/v1/jobs/:id', () => {
    let deletableJobId: string;

    it('deletes a job', async () => {
      const job = await request(app.getHttpServer())
        .post('/api/v1/jobs')
        .send({
          type: 'send_email',
          payload: { to: 'delete@test.com', subject: 'Delete' },
        })
        .expect(201);

      deletableJobId = job.body.id;

      await request(app.getHttpServer())
        .delete(`/api/v1/jobs/${deletableJobId}`)
        .expect(204);
    });

    it('returns 404 when deleting a deleted job', async () => {
      await request(app.getHttpServer())
        .delete(`/api/v1/jobs/${deletableJobId}`)
        .expect(404);
    });
  });

  // ─── Dead Letter Queue ──────────────────────────────────

  describe('Dead Letter Queue', () => {
    it('GET /api/v1/dead-letter returns an array', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/dead-letter')
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
    });

    it('POST /api/v1/dead-letter/:id/retry creates a new job', async () => {
      // Create a failed job first
      const job = await request(app.getHttpServer())
        .post('/api/v1/jobs')
        .send({
          type: 'send_email',
          payload: { to: 'dlq@test.com', subject: 'DLQ Test' },
        })
        .expect(201);

      // Manually push to DLQ by simulating retries exhausted
      const dlqRepo = dataSource.getRepository(DeadLetterEntry);
      const entry = dlqRepo.create({
        jobId: job.body.id,
        errorMessage: 'Simulated failure for test',
        finalRetryCount: 3,
        jobSnapshot: {
          id: job.body.id,
          type: 'send_email',
          payload: { to: 'dlq@test.com', subject: 'DLQ Test' },
          priority: 2,
          status: 'failed',
          retryCount: 3,
          lastError: 'Simulated failure for test',
        },
      });
      const saved = await dlqRepo.save(entry);
      dlqEntryId = saved.id;

      // Retry it
      const res = await request(app.getHttpServer())
        .post(`/api/v1/dead-letter/${dlqEntryId}/retry`)
        .expect(201);

      expect(res.body.type).toBe('send_email');
      expect(res.body.status).toBe('pending');
      expect(res.body.retryCount).toBe(0);
    });

    it('POST /api/v1/dead-letter/:id/retry returns 404 for unknown entry', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/dead-letter/00000000-0000-0000-0000-000000000000/retry')
        .expect(404);
    });
  });

  // ─── DAG Cycle Detection ────────────────────────────────

  describe('DAG cycle detection', () => {
    it('rejects job creation that would create a dependency cycle', async () => {
      // Create job A
      const jobA = await request(app.getHttpServer())
        .post('/api/v1/jobs')
        .send({
          type: 'send_email',
          payload: { to: 'cycle@test.com', subject: 'A' },
        })
        .expect(201);

      // Create job B depending on A
      const jobB = await request(app.getHttpServer())
        .post('/api/v1/jobs')
        .send({
          type: 'send_email',
          payload: { to: 'cycle@test.com', subject: 'B' },
          dependsOn: [jobA.body.id],
        })
        .expect(201);

      // Create job C depending on B is fine
      await request(app.getHttpServer())
        .post('/api/v1/jobs')
        .send({
          type: 'send_email',
          payload: { to: 'cycle@test.com', subject: 'C' },
          dependsOn: [jobB.body.id],
        })
        .expect(201);

      // Update A to depend on C -> cycle: A -> B -> C -> A
      // This is done via direct DB update since PATCH doesn't support dependsOn
      await dataSource.getRepository(Job).update(jobA.body.id, {
        dependsOn: [jobB.body.id],
      });

      // Now create job D depending on A should detect cycle
      await request(app.getHttpServer())
        .post('/api/v1/jobs')
        .send({
          type: 'send_email',
          payload: { to: 'cycle@test.com', subject: 'D' },
          dependsOn: [jobA.body.id],
        })
        .expect(400);
    });
  });

  // ─── Swagger Docs ───────────────────────────────────────

  describe('GET /docs', () => {
    it('serves Swagger UI', async () => {
      await request(app.getHttpServer())
        .get('/docs')
        .expect(200)
        .expect((res) => {
          expect(res.text).toContain('swagger');
        });
    });
  });
});
