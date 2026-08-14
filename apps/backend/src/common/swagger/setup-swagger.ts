import type { INestApplication } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { RequestHandler } from 'express';
import expressBasicAuth from 'express-basic-auth';
import {
  getSwaggerBasicAuthUsers,
  shouldProtectSwagger,
} from './swagger.config';

export const SWAGGER_PATH = '/api/docs';

/**
 * Protects both /api/docs (UI) and /api/docs-json (spec) — with
 * express/path-to-regexp v8 a '/api/docs' prefix mount does NOT match
 * '/api/docs-json', so both paths must be mounted explicitly.
 * express-basic-auth compares credentials in constant time.
 */
export function buildSwaggerAuthMiddleware(
  config: ConfigService,
): RequestHandler {
  const { user, password } = getSwaggerBasicAuthUsers(config);
  return expressBasicAuth({ challenge: true, users: { [user]: password } });
}

export function setupSwagger(
  app: INestApplication,
  config: ConfigService,
): void {
  if (shouldProtectSwagger(config.get<string>('NODE_ENV', 'development'))) {
    const middleware = buildSwaggerAuthMiddleware(config);
    app.use(SWAGGER_PATH, middleware);
    app.use(`${SWAGGER_PATH}-json`, middleware);
  }

  const document = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle('Casso Ledger API')
      .setDescription(
        'Casso Ledger backend REST API. ' +
          'All errors share the envelope { statusCode, errorCode, message, details? } — ' +
          'see AGENTS.md "API Error Codes" for the full list.',
      )
      .setVersion('1.0.0')
      .build(),
  );
  SwaggerModule.setup(SWAGGER_PATH, app, document);
}
