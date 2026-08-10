import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { JsonLogger } from './common/observability/json-logger.service';
import { configureApp } from './configure-app';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(JsonLogger));
  app.use(helmet());
  app.use(cookieParser());
  configureApp(app);
  await app.listen(3000);
}
bootstrap();
