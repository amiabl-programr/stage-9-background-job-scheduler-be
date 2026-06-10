import {
  IsString,
  IsObject,
  IsOptional,
  IsEnum,
  IsDateString,
  IsUUID,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { JobPriority } from '../entities/job.entity';

export class CreateJobDto {
  @ApiProperty({ description: 'Job type identifier' })
  @IsString()
  type: string;

  @ApiProperty({ description: 'Job payload data' })
  @IsObject()
  payload: Record<string, unknown>;

  @ApiPropertyOptional({ enum: JobPriority, default: JobPriority.MEDIUM })
  @IsEnum(JobPriority)
  @IsOptional()
  priority?: number;

  @ApiPropertyOptional({ description: 'Schedule for future execution' })
  @IsDateString()
  @IsOptional()
  scheduledAt?: string;

  @ApiPropertyOptional({ description: 'Recurring interval key' })
  @IsString()
  @IsOptional()
  recurringInterval?: string;

  @ApiPropertyOptional({ description: 'Dependency job IDs' })
  @IsUUID('4', { each: true })
  @IsOptional()
  dependsOn?: string[];
}
