import { Module } from '@nestjs/common';
import { SchedulerService } from './scheduler.service';
import { QueueModule } from '../queue/queue.module';
import { JobsModule } from '../jobs/jobs.module';
import { DagModule } from '../dependency-graph/dag.module';

@Module({
  imports: [QueueModule, JobsModule, DagModule],
  providers: [SchedulerService],
  exports: [SchedulerService],
})
export class SchedulerModule {}
