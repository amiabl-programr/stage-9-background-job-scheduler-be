import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { ConfigService } from '@nestjs/config';
import { JobsRepository } from '../jobs/jobs.repository';
import { Job } from '../jobs/entities/job.entity';
import { MinHeap } from '../queue/heap/min-heap';

@Injectable()
export class SchedulerService implements OnModuleInit {
  private readonly logger = new Logger(SchedulerService.name);
  private readonly heap = new MinHeap<Job>(SchedulerService.compareJobs);
  private tickIntervalMs: number;
  private intervalHandle: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly jobsRepository: JobsRepository,
    @InjectQueue('jobs') private readonly jobsQueue: Queue,
    private readonly configService: ConfigService,
  ) {}

  onModuleInit(): void {
    this.tickIntervalMs = this.configService.get<number>(
      'SCHEDULER_TICK_MS',
      1000,
    );
    this.logger.log(
      `Scheduler starting with tick interval ${this.tickIntervalMs}ms`,
    );
    this.intervalHandle = setInterval(() => {
      void this.tick();
    }, this.tickIntervalMs);
  }

  private async tick(): Promise<void> {
    try {
      const eligible = await this.jobsRepository.findEligibleJobs();
      if (eligible.length === 0) return;

      for (const job of eligible) {
        this.heap.push(job);
      }

      const top = this.heap.pop();
      if (!top) return;

      await this.jobsRepository.markProcessing(top.id);

      await this.jobsQueue.add(
        'process-job',
        {
          jobId: top.id,
          type: top.type,
          payload: top.payload,
          priority: top.priority,
          effectivePriority: top.effectivePriority,
        },
        {
          jobId: top.id,
          priority: top.priority,
        },
      );

      this.logger.log(`Enqueued job ${top.id} (${top.type})`);
    } catch (err) {
      this.logger.error('Scheduler tick failed', err);
    }
  }

  private static compareJobs(this: void, a: Job, b: Job): number {
    if (a.effectivePriority !== b.effectivePriority) {
      return a.effectivePriority - b.effectivePriority;
    }
    const aTime = a.scheduledAt?.getTime() ?? 0;
    const bTime = b.scheduledAt?.getTime() ?? 0;
    if (aTime !== bTime) {
      return aTime - bTime;
    }
    return a.createdAt.getTime() - b.createdAt.getTime();
  }
}
