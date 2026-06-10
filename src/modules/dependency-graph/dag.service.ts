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
    const onPath = new Set<string>();

    const depthFirstSearch = async (currentId: string): Promise<boolean> => {
      if (currentId === jobId) return true;
      if (onPath.has(currentId)) return true;
      onPath.add(currentId);

      const job = await this.jobsRepository.findById(currentId);
      if (!job) {
        onPath.delete(currentId);
        return false;
      }

      for (const dependencyId of job.dependsOn ?? []) {
        if (await depthFirstSearch(dependencyId)) {
          onPath.delete(currentId);
          return true;
        }
      }

      onPath.delete(currentId);
      return false;
    };

    for (const dependencyId of dependsOn) {
      if (await depthFirstSearch(dependencyId)) return true;
    }
    return false;
  }
}
