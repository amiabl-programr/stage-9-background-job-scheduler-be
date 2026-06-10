import { Test, TestingModule } from '@nestjs/testing';
import { DagService } from './dag.service';
import { JobsRepository } from '../jobs/jobs.repository';
import { Job, JobStatus } from '../jobs/entities/job.entity';

describe('DagService', () => {
  let service: DagService;
  let mockRepo: Partial<Record<keyof JobsRepository, jest.Mock>>;

  const makeJob = (overrides: Partial<Job> = {}): Job =>
    ({ id: 'job-default', status: JobStatus.PENDING, dependsOn: [], ...overrides }) as Job;

  beforeEach(async () => {
    mockRepo = {
      findByIds: jest.fn(),
      findById: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DagService,
        { provide: JobsRepository, useValue: mockRepo },
      ],
    }).compile();

    service = module.get<DagService>(DagService);
  });

  describe('areDependenciesMet', () => {
    it('returns true if job has no dependencies', async () => {
      const job = makeJob({ dependsOn: [] });
      await expect(service.areDependenciesMet(job)).resolves.toBe(true);
    });

    it('returns true if all dependencies are completed', async () => {
      mockRepo.findByIds!.mockResolvedValue([
        makeJob({ id: 'dep-1', status: JobStatus.COMPLETED }),
        makeJob({ id: 'dep-2', status: JobStatus.COMPLETED }),
      ]);

      const job = makeJob({ dependsOn: ['dep-1', 'dep-2'] });
      await expect(service.areDependenciesMet(job)).resolves.toBe(true);
    });

    it('returns false if any dependency is not completed', async () => {
      mockRepo.findByIds!.mockResolvedValue([
        makeJob({ id: 'dep-1', status: JobStatus.COMPLETED }),
        makeJob({ id: 'dep-2', status: JobStatus.PENDING }),
      ]);

      const job = makeJob({ dependsOn: ['dep-1', 'dep-2'] });
      await expect(service.areDependenciesMet(job)).resolves.toBe(false);
    });

    it('returns false if a dependency is cancelled', async () => {
      mockRepo.findByIds!.mockResolvedValue([
        makeJob({ id: 'dep-1', status: JobStatus.CANCELLED }),
      ]);

      const job = makeJob({ dependsOn: ['dep-1'] });
      await expect(service.areDependenciesMet(job)).resolves.toBe(false);
    });

    it('queries the repository with the correct IDs', async () => {
      mockRepo.findByIds!.mockResolvedValue([]);
      const job = makeJob({ dependsOn: ['id-1', 'id-2'] });
      await service.areDependenciesMet(job);
      expect(mockRepo.findByIds).toHaveBeenCalledWith(['id-1', 'id-2']);
    });
  });

  describe('detectCycle', () => {
    it('returns false for a simple dependency chain (no cycle)', async () => {
      // A -> B -> C is fine
      mockRepo.findById!.mockImplementation((id: string) => {
        const map: Record<string, Job> = {
          'A': makeJob({ id: 'A', dependsOn: [] }),
          'B': makeJob({ id: 'B', dependsOn: ['A'] }),
          'C': makeJob({ id: 'C', dependsOn: ['B'] }),
        };
        return Promise.resolve(map[id] ?? null);
      });

      await expect(service.detectCycle('C', ['B'])).resolves.toBe(false);
    });

    it('returns true if dependency creates a direct cycle', async () => {
      mockRepo.findById!.mockImplementation((id: string) => {
        const map: Record<string, Job> = {
          'A': makeJob({ id: 'A', dependsOn: ['B'] }),
          'B': makeJob({ id: 'B', dependsOn: [] }),
        };
        return Promise.resolve(map[id] ?? null);
      });

      // Job B depends on A, but A already depends on B -> cycle
      await expect(service.detectCycle('B', ['A'])).resolves.toBe(true);
    });

    it('returns true if dependency creates an indirect cycle', async () => {
      mockRepo.findById!.mockImplementation((id: string) => {
        const map: Record<string, Job> = {
          'A': makeJob({ id: 'A', dependsOn: ['B'] }),
          'B': makeJob({ id: 'B', dependsOn: ['C'] }),
          'C': makeJob({ id: 'C', dependsOn: ['A'] }),
        };
        return Promise.resolve(map[id] ?? null);
      });

      // New job X depends on A. A -> B -> C -> A = cycle
      await expect(service.detectCycle('X', ['A'])).resolves.toBe(true);
    });

    it('returns false when a dependency does not exist', async () => {
      mockRepo.findById!.mockResolvedValue(null);
      await expect(service.detectCycle('X', ['nonexistent'])).resolves.toBe(false);
    });

    it('returns false when dependsOn is empty', async () => {
      await expect(service.detectCycle('X', [])).resolves.toBe(false);
    });

    it('handles diamond dependencies (no cycle)', async () => {
      // A -> B, A -> C, B -> D, C -> D is fine
      mockRepo.findById!.mockImplementation((id: string) => {
        const map: Record<string, Job> = {
          'A': makeJob({ id: 'A', dependsOn: [] }),
          'B': makeJob({ id: 'B', dependsOn: ['A'] }),
          'C': makeJob({ id: 'C', dependsOn: ['A'] }),
          'D': makeJob({ id: 'D', dependsOn: ['B', 'C'] }),
        };
        return Promise.resolve(map[id] ?? null);
      });

      await expect(service.detectCycle('D', ['B', 'C'])).resolves.toBe(false);
    });

    it('detects self-loop', async () => {
      mockRepo.findById!.mockImplementation((id: string) => {
        const map: Record<string, Job> = {
          'A': makeJob({ id: 'A', dependsOn: ['A'] }),
        };
        return Promise.resolve(map[id] ?? null);
      });

      await expect(service.detectCycle('A', ['A'])).resolves.toBe(true);
    });
  });
});
