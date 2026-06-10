import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Patch,
  Delete,
  Query,
  Logger,
  Req,
  Res,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBody } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { JobsService } from './jobs.service';
import { CreateJobDto } from './dto/create-job.dto';
import { UpdateJobDto } from './dto/update-job.dto';
import { ListJobsQueryDto } from './dto/list-jobs-query.dto';
import { Job } from './entities/job.entity';
import { EventsService } from '../events/events.service';

@ApiTags('Jobs')
@Controller('jobs')
export class JobsController {
  private readonly logger = new Logger(JobsController.name);

  constructor(
    private readonly jobsService: JobsService,
    private readonly eventsService: EventsService,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Create a new job' })
  @ApiBody({
    type: CreateJobDto,
    examples: {
      email: {
        summary: 'Send email',
        value: {
          type: 'send_email',
          payload: { to: 'user@example.com', subject: 'Welcome' },
          priority: 2,
        },
      },
      recurring: {
        summary: 'Recurring email every minute',
        value: {
          type: 'send_email',
          payload: { to: 'digest@example.com', subject: 'Digest' },
          recurringInterval: 'every_1_minute',
        },
      },
      scheduled: {
        summary: 'Scheduled future job',
        value: {
          type: 'send_email',
          payload: { to: 'future@example.com', subject: 'Later' },
          scheduledAt: '2026-06-10T12:00:00.000Z',
        },
      },
    },
  })
  @ApiResponse({ status: 201, type: Job })
  @ApiResponse({ status: 422, description: 'Validation failed' })
  async create(@Body() dto: CreateJobDto): Promise<Job> {
    this.logger.log({ event: 'job.create_request', type: dto.type });
    return this.jobsService.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'List jobs with optional filters and pagination' })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 422, description: 'Validation failed' })
  async findAll(@Query() query: ListJobsQueryDto) {
    return this.jobsService.findAll(query);
  }

  @Get('events')
  @ApiOperation({ summary: 'SSE stream for real-time job updates' })
  async events(@Req() request: Request, @Res() response: Response): Promise<void> {
    const clientId = `sse_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    this.eventsService.addClient(clientId, response);
    this.logger.log({ event: 'sse.client_connected', clientId });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get job by ID' })
  @ApiResponse({ status: 200, type: Job })
  @ApiResponse({ status: 404, description: 'Job not found' })
  async findOne(@Param('id') id: string): Promise<Job> {
    return this.jobsService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a job' })
  @ApiResponse({ status: 200, type: Job })
  @ApiResponse({ status: 422, description: 'Validation failed' })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateJobDto,
  ): Promise<Job> {
    return this.jobsService.update(id, dto);
  }

  @Patch(':id/cancel')
  @ApiOperation({ summary: 'Cancel a job (pending or processing only)' })
  @ApiResponse({ status: 200, type: Job })
  @ApiResponse({ status: 409, description: 'Job is in a terminal state' })
  async cancel(@Param('id') id: string): Promise<Job> {
    return this.jobsService.cancel(id);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a job' })
  @ApiResponse({ status: 204, description: 'Deleted' })
  async remove(@Param('id') id: string): Promise<void> {
    await this.jobsService.remove(id);
  }
}
