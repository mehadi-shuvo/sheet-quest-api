import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { validateEnv } from './config/env';
async function bootstrap() {
  const env = validateEnv(process.env);
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.use(helmet());
  app.enableShutdownHooks();
  app.setGlobalPrefix('v1', { exclude: ['health/live','health/ready'] });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  await app.listen(env.PORT, '0.0.0.0');
}
bootstrap().catch(err => { console.error(err); process.exit(1); });
