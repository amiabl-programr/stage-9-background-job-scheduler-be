import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DeadLetterController } from './dead-letter.controller';
import { DeadLetterService } from './dead-letter.service';
import { DeadLetterRepository } from './dead-letter.repository';
import { DeadLetterEntry } from './entities/dead-letter-entry.entity';
import { QueueModule } from '../queue/queue.module';
import { JobsModule } from '../jobs/jobs.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([DeadLetterEntry]),
    QueueModule,
    JobsModule,
  ],
  controllers: [DeadLetterController],
  providers: [DeadLetterService, DeadLetterRepository],
  exports: [DeadLetterService, DeadLetterRepository],
})
export class DeadLetterModule {}
