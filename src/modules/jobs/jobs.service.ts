import {
  Injectable,
  Logger,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { Job, JobStatus } from './entities/job.entity';
import { CreateJobDto } from './dto/create-job.dto';
import { UpdateJobDto } from './dto/update-job.dto';
import { ListJobsQueryDto } from './dto/list-jobs-query.dto';
import { JobsRepository } from './jobs.repository';
import { DagService } from '../dependency-graph/dag.service';

@Injectable()
export class JobsService {
  private readonly logger = new Logger(JobsService.name);

  constructor(
    private readonly jobsRepository: JobsRepository,
    private readonly dagService: DagService,
  ) {}

  async create(dto: CreateJobDto): Promise<Job> {
    const job = this.jobsRepository.create({
      ...dto,
      scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : null,
    });
    const saved = await this.jobsRepository.save(job);

    if (saved.dependsOn && saved.dependsOn.length > 0) {
      const hasCycle = await this.dagService.detectCycle(
        saved.id,
        saved.dependsOn,
      );
      if (hasCycle) {
        await this.jobsRepository.delete(saved.id);
        throw new BadRequestException(
          `Cannot create job ${saved.id}: dependency cycle detected`,
        );
      }
    }

    this.logger.log(`Job created: ${saved.id}`);
    return saved;
  }

  async findAll(
    query: ListJobsQueryDto,
  ): Promise<{ data: Job[]; total: number; page: number; limit: number }> {
    const { status, type, priority, page = 1, limit = 20 } = query;

    const qb = this.jobsRepository.createQueryBuilder('job');

    if (status) qb.andWhere('job.status = :status', { status });
    if (type) qb.andWhere('job.type = :type', { type });
    if (priority) qb.andWhere('job.priority = :priority', { priority });

    const total = await qb.getCount();
    const data = await qb
      .orderBy('job.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getMany();

    return { data, total, page, limit };
  }

  async findOne(id: string): Promise<Job> {
    const job = await this.jobsRepository.findById(id);
    if (!job) throw new NotFoundException(`Job ${id} not found`);
    return job;
  }

  async update(id: string, dto: UpdateJobDto): Promise<Job> {
    await this.jobsRepository.update(id, dto);
    return this.findOne(id);
  }

  async cancel(id: string): Promise<Job> {
    const job = await this.findOne(id);

    if (
      job.status === JobStatus.COMPLETED ||
      job.status === JobStatus.FAILED ||
      job.status === JobStatus.CANCELLED
    ) {
      throw new ConflictException(
        `Cannot cancel job ${id}: already in terminal state ${job.status}`,
      );
    }

    await this.jobsRepository.update(id, { status: JobStatus.CANCELLED });
    this.logger.log(`Job cancelled: ${id}`);
    return this.findOne(id);
  }

  async remove(id: string): Promise<void> {
    const job = await this.findOne(id);
    await this.jobsRepository.delete(job.id);
    this.logger.log(`Job deleted: ${id}`);
  }
}
