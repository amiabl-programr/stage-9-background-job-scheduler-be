import { NestFactory } from '@nestjs/core';
import {
  Logger,
  UnprocessableEntityException,
  ValidationPipe,
} from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Logger as PinoLogger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import { validateEnv } from './config/env';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(PinoLogger));

  app.enableCors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  app.setGlobalPrefix('api/v1', { exclude: ['health'] });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      exceptionFactory: (errors) =>
        new UnprocessableEntityException(
          errors.map((e) => ({
            property: e.property,
            constraints: e.constraints,
          })),
        ),
    }),
  );

  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(new ResponseInterceptor());

  const env = validateEnv(process.env);

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Background Job Scheduler API')
    .setDescription(
      'Manage, schedule, and monitor background jobs with priority queuing, DAG dependencies, and real-time SSE events.',
    )
    .setVersion('1.0')
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);

  SwaggerModule.setup('docs', app, document);

  await app.listen(env.PORT);

  Logger.log(`Server running on port ${env.PORT}`, 'Bootstrap');
  Logger.log(`Swagger docs at ${env.APP_URL}/docs`, 'Bootstrap');
}

bootstrap().catch((err: unknown) => {
  process.stderr.write(`Server failed to start: ${(err as Error).message}\n`);
  process.exit(1);
});
