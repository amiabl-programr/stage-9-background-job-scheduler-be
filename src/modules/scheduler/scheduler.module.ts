import { Module } from '@nestjs/common';
import { SchedulerService } from './scheduler.service';
import { QueueModule } from '../queue/queue.module';
import { JobsModule } from '../jobs/jobs.module';

@Module({
  imports: [QueueModule, JobsModule],
  providers: [SchedulerService],
  exports: [SchedulerService],
})
export class SchedulerModule {}
