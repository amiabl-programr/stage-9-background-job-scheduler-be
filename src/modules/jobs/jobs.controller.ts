import { Controller, Get, Post, Body, Param, Patch, Delete, Logger } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { JobsService } from './jobs.service';
import { CreateJobDto } from './dto/create-job.dto';
import { UpdateJobDto } from './dto/update-job.dto';
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
  @ApiOperation({ summary: 'List all jobs' })
  @ApiResponse({ status: 200, type: [Job] })
  async findAll(): Promise<Job[]> {
    return this.jobsService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get job by ID' })
  @ApiResponse({ status: 200, type: Job })
  @ApiResponse({ status: 404, description: 'Job not found' })
  async findOne(@Param('id') id: string): Promise<Job | null> {
    return this.jobsService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a job' })
  @ApiResponse({ status: 200, type: Job })
  async update(@Param('id') id: string, @Body() dto: UpdateJobDto): Promise<Job | null> {
    return this.jobsService.update(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a job' })
  @ApiResponse({ status: 204, description: 'Deleted' })
  async remove(@Param('id') id: string): Promise<void> {
    await this.jobsService.remove(id);
  }
}
