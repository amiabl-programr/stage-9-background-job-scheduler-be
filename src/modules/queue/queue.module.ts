import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { LockService } from './lock.service';

@Module({
  imports: [BullModule.registerQueue({ name: 'jobs' })],
  providers: [LockService],
  exports: [BullModule, LockService],
})
export class QueueModule {}
