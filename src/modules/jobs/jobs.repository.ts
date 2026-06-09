import { Injectable } from '@nestjs/common';
import { DataSource, Repository, In } from 'typeorm';
import { Job, JobStatus } from './entities/job.entity';

@Injectable()
export class JobsRepository extends Repository<Job> {
  constructor(private dataSource: DataSource) {
    super(Job, dataSource.createEntityManager());
  }

  async findById(id: string): Promise<Job | null> {
    return this.findOne({ where: { id } });
  }

  async findByIds(ids: string[]): Promise<Job[]> {
    return this.find({ where: { id: In(ids) } });
  }

  async findEligibleJobs(): Promise<Job[]> {
    return this.createQueryBuilder('job')
      .where('job.status = :status', { status: JobStatus.PENDING })
      .andWhere('(job.scheduledAt IS NULL OR job.scheduledAt <= NOW())')
      .getMany();
  }

  async markProcessing(id: string): Promise<void> {
    await this.update(id, { status: JobStatus.PROCESSING, startedAt: new Date() });
  }

  async markCompleted(id: string): Promise<void> {
    await this.update(id, { status: JobStatus.COMPLETED, completedAt: new Date() });
  }

  async markFailed(id: string, error: string): Promise<void> {
    await this.update(id, { status: JobStatus.FAILED, lastError: error });
  }

  async incrementRetry(id: string, error: string): Promise<void> {
    await this.update(id, {
      retryCount: () => 'retryCount + 1',
      lastError: error,
    });
  }
}
