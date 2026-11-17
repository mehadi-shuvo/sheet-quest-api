import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { json } from 'express';
import helmet from 'helmet';
import { ApiExceptionFilter } from './common/filters/api-exception.filter';
import { requestLoggingMiddleware } from './common/middleware/request-logging.middleware';

export function configureApplication(app: INestApplication) {
  app.use(requestLoggingMiddleware);
  app.use(helmet());
  app.use(json({ limit: '1mb', strict: true }));
  app.enableShutdownHooks();
  app.setGlobalPrefix('v1', { exclude: ['health/live', 'health/ready'] });
  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    validationError: { target: false, value: false },
  }));
  app.useGlobalFilters(new ApiExceptionFilter());
}
