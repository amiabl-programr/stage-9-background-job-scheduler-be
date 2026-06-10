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
  @ApiProperty({ description: 'Job type identifier', example: 'send_email' })
  @IsString()
  type: string;

  @ApiProperty({
    description: 'Job payload data',
    example: { to: 'user@example.com', subject: 'Welcome' },
  })
  @IsObject()
  payload: Record<string, unknown>;

  @ApiPropertyOptional({ enum: JobPriority, default: JobPriority.MEDIUM, example: JobPriority.MEDIUM })
  @IsEnum(JobPriority)
  @IsOptional()
  priority?: number;

  @ApiPropertyOptional({
    description: 'Schedule for future execution (ISO 8601)',
    example: '2026-06-10T12:00:00.000Z',
  })
  @IsDateString()
  @IsOptional()
  scheduledAt?: string;

  @ApiPropertyOptional({
    description: 'Recurring interval key',
    example: 'every_1_minute',
  })
  @IsString()
  @IsOptional()
  recurringInterval?: string;

  @ApiPropertyOptional({
    description: 'Dependency job IDs',
    example: ['550e8400-e29b-41d4-a716-446655440000'],
  })
  @IsUUID('4', { each: true })
  @IsOptional()
  dependsOn?: string[];
}
