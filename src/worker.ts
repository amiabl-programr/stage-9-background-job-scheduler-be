import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { Logger as PinoLogger } from 'nestjs-pino';
import { WorkerAppModule } from './worker.module';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(WorkerAppModule, {
    bufferLogs: true,
  });
  app.useLogger(app.get(PinoLogger));
  app.enableShutdownHooks();
  Logger.log('Worker started', 'Worker');
}

bootstrap().catch((err) => {
  process.stderr.write(`Worker failed to start: ${err.message}\n`);
  process.exit(1);
});
