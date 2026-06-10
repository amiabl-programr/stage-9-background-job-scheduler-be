import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { ConfigService } from '@nestjs/config';
import { JobsRepository } from '../jobs/jobs.repository';
import { Job } from '../jobs/entities/job.entity';
import { MinHeap } from '../queue/heap/min-heap';
import { DagService } from '../dependency-graph/dag.service';

@Injectable()
export class SchedulerService implements OnModuleInit {
  private readonly logger = new Logger(SchedulerService.name);
  private readonly heap = new MinHeap<Job>(SchedulerService.compareJobs);
  private tickIntervalMs: number;
  private starvationThresholdMs: number;
  private tickIntervalHandle: ReturnType<typeof setInterval> | null = null;
  private agingIntervalHandle: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly jobsRepository: JobsRepository,
    @InjectQueue('jobs') private readonly jobsQueue: Queue,
    private readonly configService: ConfigService,
    private readonly dagService: DagService,
  ) {}

  onModuleInit(): void {
    this.tickIntervalMs = this.configService.get<number>(
      'SCHEDULER_TICK_MS',
      1000,
    );
    this.starvationThresholdMs = this.configService.get<number>(
      'STARVATION_THRESHOLD_MS',
      60000,
    );

    this.logger.log({
      event: 'scheduler.starting',
      tickIntervalMs: this.tickIntervalMs,
      starvationThresholdMs: this.starvationThresholdMs,
    });
    this.tickIntervalHandle = setInterval(() => {
      void this.tick();
    }, this.tickIntervalMs);

    this.agingIntervalHandle = setInterval(() => {
      void this.recalculatePriorities();
    }, 10000);
  }

  private async tick(): Promise<void> {
    try {
      const eligible = await this.jobsRepository.findEligibleJobs();
      if (eligible.length === 0) return;

      for (const job of eligible) {
        const dependenciesMet = await this.dagService.areDependenciesMet(job);
        if (!dependenciesMet) continue;
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

      this.logger.log({ event: 'job.enqueued', jobId: top.id, type: top.type });
    } catch (err) {
      this.logger.error({
        event: 'scheduler.tick_failed',
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  private async recalculatePriorities(): Promise<void> {
    try {
      const updatedCount =
        await this.jobsRepository.recalculateEffectivePriority(
          this.starvationThresholdMs,
        );
      if (updatedCount > 0) {
        this.logger.log({
          event: 'starvation.priorities_updated',
          count: updatedCount,
        });
      }
    } catch (err) {
      this.logger.error({
        event: 'starvation.recalculation_failed',
        error: err instanceof Error ? err.message : String(err),
      });
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
