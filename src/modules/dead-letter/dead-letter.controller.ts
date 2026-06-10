import { Controller, Get, Post, Param, Logger } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { DeadLetterService } from './dead-letter.service';
import { DeadLetterEntry } from './entities/dead-letter-entry.entity';
import { Job } from '../jobs/entities/job.entity';

@ApiTags('Dead Letter Queue')
@Controller('dead-letter')
export class DeadLetterController {
  private readonly logger = new Logger(DeadLetterController.name);

  constructor(private readonly deadLetterService: DeadLetterService) {}

  @Get()
  @ApiOperation({ summary: 'List all dead letter queue entries' })
  @ApiResponse({ status: 200, type: [DeadLetterEntry] })
  async findAll(): Promise<DeadLetterEntry[]> {
    return this.deadLetterService.findAll();
  }

  @Post(':id/retry')
  @ApiOperation({ summary: 'Retry a failed job from the dead letter queue' })
  @ApiResponse({ status: 201, type: Job })
  @ApiResponse({ status: 404, description: 'Dead letter entry not found' })
  async retry(@Param('id') id: string): Promise<Job> {
    this.logger.log(`POST /dead-letter/${id}/retry`);
    return this.deadLetterService.retry(id);
  }
}
