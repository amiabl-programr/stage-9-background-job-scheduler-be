import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JobProcessor } from './job.processor';
import { JobsRepository } from '../jobs/jobs.repository';
import { Job } from '../jobs/entities/job.entity';
import { DeadLetterModule } from '../dead-letter/dead-letter.module';
import { QueueModule } from '../queue/queue.module';
import { EventsModule } from '../events/events.module';
import { EmailModule } from '../email/email.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Job]),
    DeadLetterModule,
    QueueModule,
    EventsModule,
    EmailModule,
  ],
  providers: [JobProcessor, JobsRepository],
})
export class WorkerModule {}
