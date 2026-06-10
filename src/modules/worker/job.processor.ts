import { Processor, WorkerHost } from '@nestjs/bullmq';
import { InjectQueue } from '@nestjs/bullmq';
import { Job as BullMQJob, Queue } from 'bullmq';
import { Logger } from '@nestjs/common';
import { JobsRepository } from '../jobs/jobs.repository';
import { Job, JobStatus } from '../jobs/entities/job.entity';
import { DeadLetterService } from '../dead-letter/dead-letter.service';
import { LockService } from '../queue/lock.service';
import { EventsService } from '../events/events.service';
import { EmailService } from '../email/email.service';

const MAX_RETRIES = 3;

@Processor('jobs')
export class JobProcessor extends WorkerHost {
  private readonly logger = new Logger(JobProcessor.name);

  constructor(
    private readonly jobsRepository: JobsRepository,
    private readonly deadLetterService: DeadLetterService,
    private readonly lockService: LockService,
    private readonly eventsService: EventsService,
    private readonly emailService: EmailService,
    @InjectQueue('jobs') private readonly jobsQueue: Queue,
  ) {
    super();
  }

  async process(job: BullMQJob<{ jobId: string }>): Promise<void> {
    if (job.name !== 'process-job') return;

    const dbJob = await this.jobsRepository.findById(job.data.jobId);
    if (!dbJob) {
      this.logger.warn({ event: 'job.not_found', jobId: job.data.jobId });
      return;
    }

    if (dbJob.status === JobStatus.CANCELLED) {
      this.logger.warn({ event: 'job.skipped_cancelled', jobId: dbJob.id });
      return;
    }

    const acquired = await this.lockService.acquireLock(dbJob.id);
    if (!acquired) {
      this.logger.warn({ event: 'job.lock_conflict', jobId: dbJob.id });
      return;
    }

    try {
      await this.jobsRepository.markProcessing(dbJob.id);
      this.logger.log({
        event: 'job.started',
        jobId: dbJob.id,
        type: dbJob.type,
      });
      this.eventsService.broadcast('job.started', {
        jobId: dbJob.id,
        type: dbJob.type,
        status: JobStatus.PROCESSING,
      });

      await this.dispatch(dbJob);
      await this.jobsRepository.markCompleted(dbJob.id);
      this.logger.log({ event: 'job.completed', jobId: dbJob.id });
      this.eventsService.broadcast('job.completed', {
        jobId: dbJob.id,
        type: dbJob.type,
        status: JobStatus.COMPLETED,
      });

      await this.rescheduleIfRecurring(dbJob);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      await this.handleFailure(dbJob, message);
    } finally {
      await this.lockService.releaseLock(dbJob.id);
    }
  }

  private async handleFailure(dbJob: Job, error: string): Promise<void> {
    const newRetryCount = dbJob.retryCount + 1;

    this.logger.warn({
      event: 'job.failed',
      jobId: dbJob.id,
      attempt: newRetryCount,
      maxRetries: MAX_RETRIES,
      error,
    });

    if (newRetryCount >= MAX_RETRIES) {
      await this.jobsRepository.markFailed(dbJob.id, error);
      await this.deadLetterService.add(dbJob, error);
      this.eventsService.broadcast('job.failed', {
        jobId: dbJob.id,
        error,
        status: JobStatus.FAILED,
      });
      return;
    }

    const delayMs = this.computeBackoff(newRetryCount);

    await this.jobsRepository.incrementRetry(dbJob.id, error);
    await this.jobsQueue.add(
      'process-job',
      { jobId: dbJob.id },
      { delay: delayMs },
    );

    this.logger.log({
      event: 'job.retry',
      jobId: dbJob.id,
      attempt: newRetryCount,
      delayMs,
    });
    this.eventsService.broadcast('job.retry', {
      jobId: dbJob.id,
      attempt: newRetryCount,
      maxRetries: MAX_RETRIES,
      delayMs,
      error,
    });
  }

  private async rescheduleIfRecurring(job: Job): Promise<void> {
    if (!job.recurringInterval) return;

    const nextScheduledAt = this.computeNextRun(job.recurringInterval);
    const nextJob = this.jobsRepository.create({
      type: job.type,
      payload: job.payload,
      priority: job.priority,
      recurringInterval: job.recurringInterval,
      scheduledAt: nextScheduledAt,
    });
    await this.jobsRepository.save(nextJob);

    this.logger.log({
      event: 'job.rescheduled',
      jobId: job.id,
      nextRunAt: nextScheduledAt.toISOString(),
    });
  }

  private computeNextRun(interval: string): Date {
    const now = new Date();
    const map: Record<string, number> = {
      every_1_minute: 60_000,
      every_5_minutes: 300_000,
      every_1_hour: 3_600_000,
    };
    return new Date(now.getTime() + (map[interval] ?? 60_000));
  }

  private computeBackoff(attempt: number): number {
    const base = Math.pow(5, attempt - 1);
    const jitter = Math.random() * base * 0.2;
    return (base + jitter) * 1000;
  }

  private async dispatch(dbJob: Job): Promise<void> {
    switch (dbJob.type) {
      case 'send_email':
        return this.handleEmail(dbJob);
      default:
        throw new Error(`Unknown job type: ${dbJob.type}`);
    }
  }

  private async handleEmail(job: Job): Promise<void> {
    const { to, subject, body } = job.payload as {
      to?: string;
      subject?: string;
      body?: string;
    };
    if (!to || !subject || !body) {
      throw new Error('Missing required email fields: to, subject, body');
    }

    await this.emailService.sendMail(to, subject, body);
  }
}
