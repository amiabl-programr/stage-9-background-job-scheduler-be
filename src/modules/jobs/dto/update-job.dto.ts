import { IsOptional, IsEnum } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { JobStatus, JobPriority } from '../entities/job.entity';

export class UpdateJobDto {
  @ApiPropertyOptional({ enum: JobStatus, example: 'pending' })
  @IsEnum(JobStatus)
  @IsOptional()
  status?: JobStatus;

  @ApiPropertyOptional({ enum: JobPriority, example: JobPriority.HIGH })
  @IsEnum(JobPriority)
  @IsOptional()
  priority?: JobPriority;
}
