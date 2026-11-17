import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { configureApplication } from './app.config';
import { validateEnv } from './config/env';
async function bootstrap() {
  const env = validateEnv(process.env);
  const app = await NestFactory.create(AppModule, { bodyParser: false, bufferLogs: true });
  configureApplication(app);
  await app.listen(env.PORT, '0.0.0.0');
}
bootstrap().catch(err => { console.error(err); process.exit(1); });
