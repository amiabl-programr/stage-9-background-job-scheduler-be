import { Injectable } from '@nestjs/common';
import Redis from 'ioredis';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class LockService {
  private redis: Redis;

  constructor(private readonly configService: ConfigService) {
    this.redis = new Redis(this.configService.get<string>('REDIS_URL')!);
  }

  async acquireLock(jobId: string, ttlMs = 30_000): Promise<boolean> {
    const key = `lock:job:${jobId}`;
    const result = await this.redis.set(key, '1', 'PX', ttlMs, 'NX');
    return result === 'OK';
  }

  async releaseLock(jobId: string): Promise<void> {
    await this.redis.del(`lock:job:${jobId}`);
  }
}
