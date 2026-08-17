import 'reflect-metadata';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { JsonLogger } from './common/observability/json-logger.service';
import { setupSwagger } from './common/swagger/setup-swagger';
import { configureApp } from './configure-app';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(JsonLogger));
  app.use(helmet());
  app.use(cookieParser());
  configureApp(app, app.get(ConfigService));
  setupSwagger(app, app.get(ConfigService));
  await app.listen(3000);
}
bootstrap();
