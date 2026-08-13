import type { INestApplication } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import expressBasicAuth from 'express-basic-auth';
import {
  getSwaggerBasicAuthUsers,
  shouldProtectSwagger,
} from './swagger.config';

export const SWAGGER_PATH = '/api/docs';

export function setupSwagger(
  app: INestApplication,
  config: ConfigService,
): void {
  if (shouldProtectSwagger(config.get<string>('NODE_ENV', 'development'))) {
    const { user, password } = getSwaggerBasicAuthUsers(config);
    // Path-prefix mount: protects both /api/docs and /api/docs-json.
    // express-basic-auth compares credentials in constant time.
    app.use(
      SWAGGER_PATH,
      expressBasicAuth({ challenge: true, users: { [user]: password } }),
    );
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
