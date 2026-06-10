import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { ConfigService } from '@nestjs/config';
import { DeadLetterRepository } from './dead-letter.repository';
import { DeadLetterEntry } from './entities/dead-letter-entry.entity';
import { JobsRepository } from '../jobs/jobs.repository';
import { Job, JobPriority, JobStatus } from '../jobs/entities/job.entity';
import { EventsService } from '../events/events.service';

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

  private readonly alertThreshold: number;

  constructor(
    private readonly deadLetterRepository: DeadLetterRepository,
    private readonly jobsRepository: JobsRepository,
    private readonly eventsService: EventsService,
    private readonly configService: ConfigService,
    @InjectQueue('jobs') private readonly jobsQueue: Queue,
  ) {
    this.alertThreshold = this.configService.get<number>(
      'DLQ_ALERT_THRESHOLD',
      10,
    );
  }

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
    this.logger.log({
      event: 'dlq.entry_added',
      jobId: job.id,
      error: errorMessage,
    });

    const count = await this.deadLetterRepository.count();
    if (count >= this.alertThreshold) {
      this.logger.warn({
        event: 'dlq.threshold_exceeded',
        count,
        threshold: this.alertThreshold,
      });
      this.eventsService.broadcast('dlq.threshold_exceeded', {
        count,
        threshold: this.alertThreshold,
        lastJobId: job.id,
      });
    }

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
    this.logger.log({ event: 'dlq.retry', newJobId: saved.id, dlqEntryId: id });

    return saved;
  }
}
