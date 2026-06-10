import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JobsController } from './jobs.controller';
import { JobsService } from './jobs.service';
import { JobsRepository } from './jobs.repository';
import { Job } from './entities/job.entity';
import { DagModule } from '../dependency-graph/dag.module';

@Module({
  imports: [TypeOrmModule.forFeature([Job]), forwardRef(() => DagModule)],
  controllers: [JobsController],
  providers: [JobsService, JobsRepository],
  exports: [JobsService, JobsRepository],
})
export class JobsModule {}
