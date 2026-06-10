import { Processor, WorkerHost } from '@nestjs/bullmq';
import { InjectQueue } from '@nestjs/bullmq';
import { Job as BullMQJob, Queue } from 'bullmq';
import { Logger } from '@nestjs/common';
import { JobsRepository } from '../jobs/jobs.repository';
import { Job, JobStatus } from '../jobs/entities/job.entity';
import { DeadLetterService } from '../dead-letter/dead-letter.service';

const MAX_RETRIES = 3;

@Processor('jobs')
export class JobProcessor extends WorkerHost {
  private readonly logger = new Logger(JobProcessor.name);

  constructor(
    private readonly jobsRepository: JobsRepository,
    private readonly deadLetterService: DeadLetterService,
    @InjectQueue('jobs') private readonly jobsQueue: Queue,
  ) {
    super();
  }

  async process(job: BullMQJob<{ jobId: string }>): Promise<void> {
    if (job.name !== 'process-job') return;

    const dbJob = await this.jobsRepository.findById(job.data.jobId);
    if (!dbJob) {
      this.logger.warn(`Job ${job.data.jobId} not found in DB`);
      return;
    }

    if (dbJob.status === JobStatus.CANCELLED) {
      this.logger.log(`Skipping cancelled job ${dbJob.id}`);
      return;
    }

    await this.jobsRepository.markProcessing(dbJob.id);
    this.logger.log(`Processing job ${dbJob.id} (${dbJob.type})`);

    try {
      await this.dispatch(dbJob);
      await this.jobsRepository.markCompleted(dbJob.id);
      this.logger.log(`Completed job ${dbJob.id}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      await this.handleFailure(dbJob, message);
    }
  }

  private async handleFailure(dbJob: Job, error: string): Promise<void> {
    const newRetryCount = dbJob.retryCount + 1;

    this.logger.warn(
      `Job ${dbJob.id} failed (attempt ${newRetryCount}/${MAX_RETRIES}): ${error}`,
    );

    if (newRetryCount >= MAX_RETRIES) {
      await this.jobsRepository.markFailed(dbJob.id, error);
      await this.deadLetterService.add(dbJob, error);
      return;
    }

    const delayMs = this.computeBackoff(newRetryCount);

    await this.jobsRepository.incrementRetry(dbJob.id, error);
    await this.jobsQueue.add(
      'process-job',
      { jobId: dbJob.id },
      { delay: delayMs },
    );

    this.logger.log(`Job ${dbJob.id} re-enqueued with ${delayMs}ms delay`);
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
    const { to, subject } = job.payload as { to?: string; subject?: string };
    if (!to || !subject) {
      throw new Error('Missing required email fields: to, subject');
    }

    await new Promise((resolve) =>
      setTimeout(resolve, Math.random() * 500 + 100),
    );

    if (Math.random() < 0.2) {
      throw new Error('Simulated SMTP delivery failure');
    }

    this.logger.log(
      `Email sent to ${to} — subject: "${subject}" (job ${job.id})`,
    );
  }
}
