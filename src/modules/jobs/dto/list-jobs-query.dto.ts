import { IsOptional, IsEnum, IsInt, Min, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { JobStatus, JobPriority } from '../entities/job.entity';
import { Type } from 'class-transformer';

export class ListJobsQueryDto {
  @ApiPropertyOptional({ enum: JobStatus, example: 'pending' })
  @IsEnum(JobStatus)
  @IsOptional()
  status?: JobStatus;

  @ApiPropertyOptional({ example: 'send_email' })
  @IsString()
  @IsOptional()
  type?: string;

  @ApiPropertyOptional({ enum: JobPriority, example: JobPriority.MEDIUM })
  @Type(() => Number)
  @IsEnum(JobPriority, { message: 'priority must be one of: HIGH (1), MEDIUM (2), LOW (3)' })
  @IsOptional()
  priority?: JobPriority;

  @ApiPropertyOptional({ default: 1, example: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  page?: number;

  @ApiPropertyOptional({ default: 20, example: 20 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  limit?: number;
}
