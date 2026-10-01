import 'reflect-metadata';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { JsonLogger } from './common/observability/json-logger.service';
import { setupSwagger } from './common/swagger/setup-swagger';
import { configureApp } from './configure-app';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
  });
  app.useLogger(app.get(JsonLogger));
  app.use(helmet());
  app.use(cookieParser());
  configureApp(app, app.get(ConfigService));
  app.useStaticAssets('uploads', { prefix: '/uploads' });
  setupSwagger(app, app.get(ConfigService));
  await app.listen(Number(process.env.PORT) || 3000);
}
bootstrap();
