import { Injectable } from '@nestjs/common';
import { JobsRepository } from '../jobs/jobs.repository';
import { Job, JobStatus } from '../jobs/entities/job.entity';

@Injectable()
export class DagService {
  constructor(private readonly jobsRepository: JobsRepository) {}

  async areDependenciesMet(job: Job): Promise<boolean> {
    if (!job.dependsOn || job.dependsOn.length === 0) return true;

    const dependencies = await this.jobsRepository.findByIds(job.dependsOn);
    return dependencies.every(
      (dependency) => dependency.status === JobStatus.COMPLETED,
    );
  }

  async detectCycle(jobId: string, dependsOn: string[]): Promise<boolean> {
    const visited = new Set<string>();

    const depthFirstSearch = async (currentId: string): Promise<boolean> => {
      if (currentId === jobId) return true;
      if (visited.has(currentId)) return false;
      visited.add(currentId);

      const job = await this.jobsRepository.findById(currentId);
      if (!job) return false;

      for (const dependencyId of job.dependsOn ?? []) {
        if (await depthFirstSearch(dependencyId)) return true;
      }
      return false;
    };

    for (const dependencyId of dependsOn) {
      if (await depthFirstSearch(dependencyId)) return true;
    }
    return false;
  }
}
