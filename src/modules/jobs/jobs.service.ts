import { Injectable, Logger } from '@nestjs/common';
import { Job } from './entities/job.entity';
import { CreateJobDto } from './dto/create-job.dto';
import { UpdateJobDto } from './dto/update-job.dto';
import { JobsRepository } from './jobs.repository';

@Injectable()
export class JobsService {
  private readonly logger = new Logger(JobsService.name);

  constructor(private readonly jobsRepository: JobsRepository) {}

  async create(dto: CreateJobDto): Promise<Job> {
    const job = this.jobsRepository.create({
      ...dto,
      scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : null,
    });
    const saved = await this.jobsRepository.save(job);
    this.logger.log(`Job created: ${saved.id}`);
    return saved;
  }

  async findAll(): Promise<Job[]> {
    return this.jobsRepository.find({ order: { createdAt: 'DESC' } });
  }

  async findOne(id: string): Promise<Job | null> {
    return this.jobsRepository.findById(id);
  }

  async update(id: string, dto: UpdateJobDto): Promise<Job | null> {
    await this.jobsRepository.update(id, dto);
    return this.jobsRepository.findById(id);
  }

  async remove(id: string): Promise<void> {
    await this.jobsRepository.delete(id);
    this.logger.log(`Job deleted: ${id}`);
  }
}
