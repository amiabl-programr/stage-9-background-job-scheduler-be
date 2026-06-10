import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { DeadLetterRepository } from './dead-letter.repository';
import { DeadLetterEntry } from './entities/dead-letter-entry.entity';
import { JobsRepository } from '../jobs/jobs.repository';
import { Job, JobPriority, JobStatus } from '../jobs/entities/job.entity';

interface JobSnapshot {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  priority: number;
  status: JobStatus;
  retryCount: number;
  lastError: string | null;
}

@Injectable()
export class DeadLetterService {
  private readonly logger = new Logger(DeadLetterService.name);

  constructor(
    private readonly deadLetterRepository: DeadLetterRepository,
    private readonly jobsRepository: JobsRepository,
    @InjectQueue('jobs') private readonly jobsQueue: Queue,
  ) {}

  async add(job: Job, errorMessage: string): Promise<DeadLetterEntry> {
    const entry = this.deadLetterRepository.create({
      jobId: job.id,
      errorMessage,
      finalRetryCount: job.retryCount + 1,
      jobSnapshot: {
        id: job.id,
        type: job.type,
        payload: job.payload,
        priority: job.priority,
        status: job.status,
        retryCount: job.retryCount,
        lastError: job.lastError,
      },
    });

    const saved = await this.deadLetterRepository.save(entry);
    this.logger.log(
      `Job ${job.id} moved to dead letter queue (retries exhausted)`,
    );
    return saved;
  }

  async findAll(): Promise<DeadLetterEntry[]> {
    return this.deadLetterRepository.find({ order: { createdAt: 'DESC' } });
  }

  async retry(id: string): Promise<Job> {
    const entry = await this.deadLetterRepository.findOne({ where: { id } });
    if (!entry) {
      throw new NotFoundException(`Dead letter entry ${id} not found`);
    }

    const snapshot = entry.jobSnapshot as unknown as JobSnapshot;

    const newJob = this.jobsRepository.create({
      type: snapshot.type,
      payload: snapshot.payload,
      priority: snapshot.priority ?? JobPriority.MEDIUM,
    });

    const saved = await this.jobsRepository.save(newJob);
    this.logger.log(
      `Dead letter retry: new job ${saved.id} created from entry ${id}`,
    );

    return saved;
  }
}
