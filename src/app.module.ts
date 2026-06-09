import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import configuration from './config/configuration';
import { JobsModule } from './modules/jobs/jobs.module';
import { QueueModule } from './modules/queue/queue.module';
import { WorkerModule } from './modules/worker/worker.module';
import { SchedulerModule } from './modules/scheduler/scheduler.module';
import { DeadLetterModule } from './modules/dead-letter/dead-letter.module';
import { DependenciesModule } from './modules/dependencies/dependencies.module';
import { EventsModule } from './modules/events/events.module';
import { NotificationsModule } from './modules/notifications/notifications.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [configuration] }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        url: config.get('DATABASE_URL'),
        entities: [__dirname + '/**/*.entity{.ts,.js}'],
        synchronize: config.get('NODE_ENV') !== 'production',
        migrations: ['dist/database/migrations/*.js'],
        migrationsRun: true,
      }),
    }),
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: { url: config.get('REDIS_URL') },
      }),
    }),
    JobsModule,
    QueueModule,
    WorkerModule,
    SchedulerModule,
    DeadLetterModule,
    DependenciesModule,
    EventsModule,
    NotificationsModule,
  ],
})
export class AppModule {}
