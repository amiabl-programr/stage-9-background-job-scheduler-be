import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JobProcessor } from './job.processor';
import { JobsRepository } from '../jobs/jobs.repository';
import { Job } from '../jobs/entities/job.entity';

@Module({
  imports: [
    BullModule.registerQueue({ name: 'jobs' }),
    TypeOrmModule.forFeature([Job]),
  ],
  providers: [JobProcessor, JobsRepository],
})
export class WorkerModule {}
