import { ConfigService } from '@nestjs/config';
import { LockService } from './lock.service';

describe('LockService', () => {
  let service: LockService;
  let redis: { quit: () => Promise<void> };

  beforeAll(() => {
    const config = new ConfigService({
      REDIS_URL: process.env.REDIS_URL ?? 'redis://localhost:6379',
    });
    service = new LockService(config);
    redis = (service as unknown as { redis: { quit: () => Promise<void> } })
      .redis;
  });

  afterAll(async () => {
    await service.releaseLock('lock-a');
    await service.releaseLock('lock-b');
    await service.releaseLock('lock-expire');
    await redis.quit();
  });

  it('acquires a lock successfully', async () => {
    const acquired = await service.acquireLock('lock-a', 5000);
    expect(acquired).toBe(true);
    await service.releaseLock('lock-a');
  });

  it('fails to acquire an already-held lock', async () => {
    await service.acquireLock('lock-a', 5000);
    const second = await service.acquireLock('lock-a', 5000);
    expect(second).toBe(false);
    await service.releaseLock('lock-a');
  });

  it('acquires lock after it is released', async () => {
    await service.acquireLock('lock-a', 5000);
    await service.releaseLock('lock-a');
    const reacquired = await service.acquireLock('lock-a', 5000);
    expect(reacquired).toBe(true);
    await service.releaseLock('lock-a');
  });

  it('lock expires after TTL', async () => {
    await service.acquireLock('lock-expire', 100);
    expect(await service.acquireLock('lock-expire', 100)).toBe(false);
    await new Promise((r) => setTimeout(r, 200));
    expect(await service.acquireLock('lock-expire', 100)).toBe(true);
    await service.releaseLock('lock-expire');
  }, 10000);

  it('acquires locks for different job IDs independently', async () => {
    expect(await service.acquireLock('lock-a', 5000)).toBe(true);
    expect(await service.acquireLock('lock-b', 5000)).toBe(true);
    expect(await service.acquireLock('lock-a', 5000)).toBe(false);
    expect(await service.acquireLock('lock-b', 5000)).toBe(false);

    await service.releaseLock('lock-a');
    await service.releaseLock('lock-b');
    expect(await service.acquireLock('lock-a', 5000)).toBe(true);
    await service.releaseLock('lock-a');
  });
});
