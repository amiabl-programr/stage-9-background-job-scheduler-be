import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JobProcessor } from './job.processor';
import { JobsRepository } from '../jobs/jobs.repository';
import { Job } from '../jobs/entities/job.entity';
import { DeadLetterModule } from '../dead-letter/dead-letter.module';

@Module({
  imports: [
    BullModule.registerQueue({ name: 'jobs' }),
    TypeOrmModule.forFeature([Job]),
    DeadLetterModule,
  ],
  providers: [JobProcessor, JobsRepository],
})
export class WorkerModule {}
