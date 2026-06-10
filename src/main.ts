import { type Request, type Response } from 'express';
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

  app.enableCors();
  app.setGlobalPrefix('api/v1', { exclude: ['health'] });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      exceptionFactory: (errors) => {
        return new UnprocessableEntityException(
          errors.map((e) => ({
            property: e.property,
            constraints: e.constraints,
          })),
        );
      },
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

  SwaggerModule.setup('api/docs', app, document, {
    swaggerOptions: {
      url: '/api/docs-json',
    },
  });

  app.getHttpAdapter().get('/api/docs-json', (req: Request, res: Response) => {
    const protocol = (req.headers['x-forwarded-proto'] || 'http') as string;
    const host = (req.headers['x-forwarded-host'] || req.headers.host) as string;
    const serverUrl = `${protocol}://${host}`;

    res.json({
      ...document,
      servers: [{ url: serverUrl, description: 'Server' }],
    });
  });

  await app.listen(env.PORT);
  Logger.log(`Server running on port ${env.PORT}`, 'Bootstrap');
  Logger.log(`Swagger docs at ${env.APP_URL}/api/docs`, 'Bootstrap');
}

bootstrap().catch((err: unknown) => {
  process.stderr.write(`Server failed to start: ${(err as Error).message}\n`);
  process.exit(1);
});
