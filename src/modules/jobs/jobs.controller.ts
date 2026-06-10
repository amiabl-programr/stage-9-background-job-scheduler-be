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
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { JobsService } from './jobs.service';
import { CreateJobDto } from './dto/create-job.dto';
import { UpdateJobDto } from './dto/update-job.dto';
import { ListJobsQueryDto } from './dto/list-jobs-query.dto';
import { Job } from './entities/job.entity';

@ApiTags('Jobs')
@Controller('jobs')
export class JobsController {
  private readonly logger = new Logger(JobsController.name);

  constructor(private readonly jobsService: JobsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new job' })
  @ApiResponse({ status: 201, type: Job })
  async create(@Body() dto: CreateJobDto): Promise<Job> {
    this.logger.log(`POST /jobs - type=${dto.type}`);
    return this.jobsService.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'List jobs with optional filters and pagination' })
  @ApiResponse({ status: 200 })
  async findAll(@Query() query: ListJobsQueryDto) {
    return this.jobsService.findAll(query);
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
