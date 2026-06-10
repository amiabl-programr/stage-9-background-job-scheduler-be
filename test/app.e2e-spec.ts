import { Test, TestingModule } from '@nestjs/testing';
import {
  INestApplication,
  ValidationPipe,
  UnprocessableEntityException,
} from '@nestjs/common';
import request from 'supertest';
import type { Server } from 'http';
import { AppModule } from '../src/app.module';
import { DataSource } from 'typeorm';
import { Job, JobStatus } from '../src/modules/jobs/entities/job.entity';
import { DeadLetterEntry } from '../src/modules/dead-letter/entities/dead-letter-entry.entity';

interface JobBody {
  id: string;
  type: string;
  status: string;
  priority: number;
  retryCount: number;
  lastError: string | null;
  dependsOn: string[];
  recurringInterval?: string;
  scheduledAt?: string;
}

interface PaginatedBody {
  data: JobBody[];
  total: number;
  page: number;
  limit: number;
}

interface HealthBody {
  status: string;
  timestamp: string;
}

describe('Background Job Scheduler (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let appServer: Server;
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
    appServer = app.getHttpServer() as Server;
    dataSource = app.get(DataSource);
  });

  afterAll(async () => {
    const jobRepo = dataSource.getRepository(Job);
    const dlqRepo = dataSource.getRepository(DeadLetterEntry);

    if (jobId) await jobRepo.delete(jobId);
    await jobRepo.delete({ type: 'send_email' });

    const entries = await dlqRepo.find();
    for (const e of entries) {
      if (e.jobSnapshot && typeof e.jobSnapshot === 'object') {
        const snapshot = e.jobSnapshot;
        const snapshotId = snapshot.id as string;
        if (snapshotId) await jobRepo.delete(snapshotId).catch(() => {});
      }
    }
    await dlqRepo.delete({});
    await jobRepo.delete({});

    await app.close();
  });

  describe('GET /api/health', () => {
    it('returns 200 with status ok', async () => {
      const res = await request(appServer).get('/api/health').expect(200);

      const body = res.body as HealthBody;
      expect(body.status).toBe('ok');
      expect(body.timestamp).toBeDefined();
    });
  });

  describe('POST /api/v1/jobs', () => {
    it('creates a job and returns 201', async () => {
      const res = await request(appServer)
        .post('/api/v1/jobs')
        .send({
          type: 'send_email',
          payload: { to: 'test@example.com', subject: 'Test' },
          priority: 1,
        })
        .expect(201);

      const body = res.body as JobBody;
      expect(body.id).toBeDefined();
      expect(body.type).toBe('send_email');
      expect(body.status).toBe('pending');
      expect(body.priority).toBe(1);
      expect(body.retryCount).toBe(0);
      expect(body.lastError).toBeNull();
      expect(body.dependsOn).toEqual([]);

      jobId = body.id;
    });

    it('creates a scheduled job with recurringInterval', async () => {
      const res = await request(appServer)
        .post('/api/v1/jobs')
        .send({
          type: 'send_email',
          payload: { to: 'test@example.com', subject: 'Recurring' },
          recurringInterval: 'every_1_minute',
          scheduledAt: new Date(Date.now() + 3600000).toISOString(),
        })
        .expect(201);

      const body = res.body as JobBody;
      expect(body.recurringInterval).toBe('every_1_minute');
      expect(body.scheduledAt).toBeDefined();
    });

    it('returns 422 when required field is missing', async () => {
      const res = await request(appServer)
        .post('/api/v1/jobs')
        .send({ payload: {} })
        .expect(422);

      const body = res.body as { message: unknown };
      expect(body.message).toBeDefined();
      expect(Array.isArray(body.message)).toBe(true);
    });

    it('returns 422 when payload is not an object', async () => {
      await request(appServer)
        .post('/api/v1/jobs')
        .send({ type: 'send_email', payload: 'not-an-object' })
        .expect(422);
    });

    it('returns 422 for unknown priority enum value', async () => {
      await request(appServer)
        .post('/api/v1/jobs')
        .send({ type: 'send_email', payload: {}, priority: 99 })
        .expect(422);
    });

    it('creates a job with dependsOn (DAG)', async () => {
      const parent = await request(appServer)
        .post('/api/v1/jobs')
        .send({
          type: 'send_email',
          payload: { to: 'dep@test.com', subject: 'Parent' },
        })
        .expect(201);

      const parentBody = parent.body as JobBody;

      await dataSource
        .getRepository(Job)
        .update(parentBody.id, { status: JobStatus.COMPLETED });

      const res = await request(appServer)
        .post('/api/v1/jobs')
        .send({
          type: 'send_email',
          payload: { to: 'dep@test.com', subject: 'Child' },
          dependsOn: [parentBody.id],
        })
        .expect(201);

      const body = res.body as JobBody;
      expect(body.dependsOn).toEqual([parentBody.id]);
    });
  });

  describe('GET /api/v1/jobs', () => {
    it('returns paginated jobs', async () => {
      const res = await request(appServer).get('/api/v1/jobs').expect(200);

      const body = res.body as PaginatedBody;
      expect(body.data).toBeDefined();
      expect(Array.isArray(body.data)).toBe(true);
      expect(body.total).toBeGreaterThanOrEqual(1);
      expect(body.page).toBe(1);
      expect(body.limit).toBe(20);
    });

    it('filters by status', async () => {
      const res = await request(appServer)
        .get('/api/v1/jobs?status=pending')
        .expect(200);

      const body = res.body as PaginatedBody;
      for (const job of body.data) {
        expect(job.status).toBe('pending');
      }
    });

    it('filters by type', async () => {
      await request(appServer).get('/api/v1/jobs?type=send_email').expect(200);
    });

    it('returns 422 for invalid status filter', async () => {
      await request(appServer)
        .get('/api/v1/jobs?status=invalid_status')
        .expect(422);
    });
  });

  describe('GET /api/v1/jobs/:id', () => {
    it('returns a job by id', async () => {
      const res = await request(appServer)
        .get(`/api/v1/jobs/${jobId}`)
        .expect(200);

      const body = res.body as JobBody;
      expect(body.id).toBe(jobId);
    });

    it('returns 404 for non-existent job', async () => {
      await request(appServer)
        .get('/api/v1/jobs/00000000-0000-0000-0000-000000000000')
        .expect(404);
    });
  });

  describe('PATCH /api/v1/jobs/:id', () => {
    it('updates a job priority', async () => {
      const res = await request(appServer)
        .patch(`/api/v1/jobs/${jobId}`)
        .send({ priority: 3 })
        .expect(200);

      const body = res.body as JobBody;
      expect(body.priority).toBe(3);
    });

    it('returns 422 for invalid status value', async () => {
      await request(appServer)
        .patch(`/api/v1/jobs/${jobId}`)
        .send({ status: 'nonexistent_status' })
        .expect(422);
    });

    it('returns 404 for non-existent job', async () => {
      await request(appServer)
        .patch('/api/v1/jobs/00000000-0000-0000-0000-000000000000')
        .send({ priority: 2 })
        .expect(404);
    });
  });

  describe('PATCH /api/v1/jobs/:id/cancel', () => {
    let cancellableJobId: string;

    it('cancels a pending job', async () => {
      const job = await request(appServer)
        .post('/api/v1/jobs')
        .send({
          type: 'send_email',
          payload: { to: 'cancel@test.com', subject: 'Cancel' },
        })
        .expect(201);

      cancellableJobId = (job.body as JobBody).id;

      const res = await request(appServer)
        .patch(`/api/v1/jobs/${cancellableJobId}/cancel`)
        .expect(200);

      const body = res.body as JobBody;
      expect(body.status).toBe('cancelled');
    });

    it('returns 409 when cancelling an already cancelled job', async () => {
      await request(appServer)
        .patch(`/api/v1/jobs/${cancellableJobId}/cancel`)
        .expect(409);
    });

    it('returns 409 when cancelling a completed job', async () => {
      const job = await request(appServer)
        .post('/api/v1/jobs')
        .send({
          type: 'send_email',
          payload: { to: 'complete@test.com', subject: 'Complete' },
        })
        .expect(201);

      const jobBody = job.body as JobBody;

      await dataSource.getRepository(Job).update(jobBody.id, {
        status: JobStatus.COMPLETED,
        completedAt: new Date(),
      });

      await request(appServer)
        .patch(`/api/v1/jobs/${jobBody.id}/cancel`)
        .expect(409);
    });
  });

  describe('DELETE /api/v1/jobs/:id', () => {
    let deletableJobId: string;

    it('deletes a job', async () => {
      const job = await request(appServer)
        .post('/api/v1/jobs')
        .send({
          type: 'send_email',
          payload: { to: 'delete@test.com', subject: 'Delete' },
        })
        .expect(201);

      deletableJobId = (job.body as JobBody).id;

      await request(appServer)
        .delete(`/api/v1/jobs/${deletableJobId}`)
        .expect(204);
    });

    it('returns 404 when deleting a deleted job', async () => {
      await request(appServer)
        .delete(`/api/v1/jobs/${deletableJobId}`)
        .expect(404);
    });
  });

  describe('Dead Letter Queue', () => {
    it('GET /api/v1/dead-letter returns an array', async () => {
      const res = await request(appServer)
        .get('/api/v1/dead-letter')
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
    });

    it('POST /api/v1/dead-letter/:id/retry creates a new job', async () => {
      const job = await request(appServer)
        .post('/api/v1/jobs')
        .send({
          type: 'send_email',
          payload: { to: 'dlq@test.com', subject: 'DLQ Test' },
        })
        .expect(201);

      const jobBody = job.body as JobBody;

      const dlqRepo = dataSource.getRepository(DeadLetterEntry);
      const entry = dlqRepo.create({
        jobId: jobBody.id,
        errorMessage: 'Simulated failure for test',
        finalRetryCount: 3,
        jobSnapshot: {
          id: jobBody.id,
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

      const res = await request(appServer)
        .post(`/api/v1/dead-letter/${dlqEntryId}/retry`)
        .expect(201);

      const body = res.body as JobBody;
      expect(body.type).toBe('send_email');
      expect(body.status).toBe('pending');
      expect(body.retryCount).toBe(0);
    });

    it('POST /api/v1/dead-letter/:id/retry returns 404 for unknown entry', async () => {
      await request(appServer)
        .post('/api/v1/dead-letter/00000000-0000-0000-0000-000000000000/retry')
        .expect(404);
    });
  });

  describe('DAG cycle detection', () => {
    it('rejects job creation that would create a dependency cycle', async () => {
      const jobA = await request(appServer)
        .post('/api/v1/jobs')
        .send({
          type: 'send_email',
          payload: { to: 'cycle@test.com', subject: 'A' },
        })
        .expect(201);

      const jobABody = jobA.body as JobBody;

      const jobB = await request(appServer)
        .post('/api/v1/jobs')
        .send({
          type: 'send_email',
          payload: { to: 'cycle@test.com', subject: 'B' },
          dependsOn: [jobABody.id],
        })
        .expect(201);

      const jobBBody = jobB.body as JobBody;

      await request(appServer)
        .post('/api/v1/jobs')
        .send({
          type: 'send_email',
          payload: { to: 'cycle@test.com', subject: 'C' },
          dependsOn: [jobBBody.id],
        })
        .expect(201);

      await dataSource.getRepository(Job).update(jobABody.id, {
        dependsOn: [jobBBody.id],
      });

      await request(appServer)
        .post('/api/v1/jobs')
        .send({
          type: 'send_email',
          payload: { to: 'cycle@test.com', subject: 'D' },
          dependsOn: [jobABody.id],
        })
        .expect(400);
    });
  });

  describe('GET /docs', () => {
    it('serves Swagger UI', async () => {
      await request(appServer)
        .get('/docs')
        .expect(200)
        .expect((res) => {
          expect(res.text).toContain('swagger');
        });
    });
  });
});
