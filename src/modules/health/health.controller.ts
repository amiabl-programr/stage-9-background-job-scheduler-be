import { Controller, Get, Logger } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiOkResponse,
  ApiProperty,
} from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { InjectDataSource } from '@nestjs/typeorm';
import Redis from 'ioredis';

class HealthCheckResponse {
  @ApiProperty({ example: 'ok' })
  status: string;

  @ApiProperty({ example: 'connected' })
  db: string;

  @ApiProperty({ example: 'connected' })
  redis: string;
}

@ApiTags('Health')
@Controller('health')
export class HealthController {
  private readonly logger = new Logger(HealthController.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly configService: ConfigService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Health check: DB and Redis status' })
  @ApiOkResponse({ type: HealthCheckResponse })
  async check(): Promise<HealthCheckResponse> {
    let dbStatus = 'disconnected';
    let redisStatus = 'disconnected';

    try {
      await this.dataSource.query('SELECT 1');
      dbStatus = 'connected';
    } catch (err) {
      this.logger.error('DB health check failed', err);
    }

    let redis: Redis | null = null;
    try {
      redis = new Redis(this.configService.get<string>('REDIS_URL')!, {
        lazyConnect: true,
        maxRetriesPerRequest: 0,
      });
      await redis.connect();
      redisStatus = 'connected';
    } catch {
      redisStatus = 'disconnected';
    } finally {
      await redis?.quit();
    }

    const status =
      dbStatus === 'connected' && redisStatus === 'connected'
        ? 'ok'
        : 'degraded';

    return { status, db: dbStatus, redis: redisStatus };
  }
}
