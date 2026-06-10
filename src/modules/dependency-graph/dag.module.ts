import { Module, forwardRef } from '@nestjs/common';
import { DagService } from './dag.service';
import { JobsModule } from '../jobs/jobs.module';

@Module({
  imports: [forwardRef(() => JobsModule)],
  providers: [DagService],
  exports: [DagService],
})
export class DagModule {}
