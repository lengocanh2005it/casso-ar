import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import {
  SWAGGER_PATH,
  setupSwagger,
} from '../src/common/swagger/setup-swagger';
import { configureApp } from '../src/configure-app';
import { WEBHOOK_JOB_QUEUE } from '../src/modules/webhooks/application/webhook-job-queue.port';

jest.setTimeout(60_000);

describe('Swagger / OpenAPI docs (integration)', () => {
  let container: StartedPostgreSqlContainer;
  let app: INestApplication;

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:16').start();
    process.env.DB_HOST = container.getHost();
    process.env.DB_PORT = String(container.getMappedPort(5432));
    process.env.DB_USERNAME = container.getUsername();
    process.env.DB_PASSWORD = container.getPassword();
    process.env.DB_DATABASE = container.getDatabase();
    process.env.REDIS_HOST = 'localhost';
    process.env.REDIS_PORT = '6379';
    process.env.JWT_SECRET = 'swagger-e2e-jwt-secret';
    process.env.ACCESS_TOKEN_ENCRYPTION_KEY =
      '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    process.env.RESEND_API_KEY = 'swagger-e2e-resend-key';
    process.env.CASSO_WEBHOOK_CLIENT_ID = 'e2e-client';
    process.env.CASSO_WEBHOOK_SECRET_KEY = 'e2e-secret';

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideModule(TypeOrmModule)
      .useModule(
        TypeOrmModule.forRoot({
          type: 'postgres',
          host: container.getHost(),
          port: container.getMappedPort(5432),
          username: container.getUsername(),
          password: container.getPassword(),
          database: container.getDatabase(),
          autoLoadEntities: true,
          synchronize: true,
          retryAttempts: 0,
        }),
      )
      .overrideProvider(WEBHOOK_JOB_QUEUE)
      .useValue({ enqueue: jest.fn() })
      .compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    configureApp(app);
    setupSwagger(app, moduleRef.get(ConfigService));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    await container.stop();
  });

  it('serves the Swagger UI at /api/docs', async () => {
    const res = await request(app.getHttpServer())
      .get(SWAGGER_PATH)
      .expect(200);
    expect(res.headers['content-type']).toMatch(/text\/html/);
  });

  it('serves an OpenAPI 3 document with prefixed paths', async () => {
    const res = await request(app.getHttpServer())
      .get(`${SWAGGER_PATH}-json`)
      .expect(200);

    expect(res.body.openapi).toMatch(/^3\./);
    expect(res.body.info.title).toBe('Casso Ledger API');
    expect(res.body.paths['/api/v1/receivables']).toBeDefined();
    expect(res.body.paths['/api/v1/receivables/{id}']).toBeDefined();
    expect(res.body.paths['/api/v1/payments/{id}/allocate']).toBeDefined();
    expect(
      res.body.paths['/api/v1/payments/allocations/{allocationId}/undo'],
    ).toBeDefined();
    expect(res.body.paths['/health']).toBeDefined();
  });

  it('groups template controllers under ApiTags', async () => {
    const res = await request(app.getHttpServer())
      .get(`${SWAGGER_PATH}-json`)
      .expect(200);
    const doc = res.body as {
      paths: Record<string, Record<string, { tags?: string[] }>>;
    };

    const operationTags: string[] = [];
    for (const operations of Object.values(doc.paths)) {
      for (const operation of Object.values(operations)) {
        if (operation.tags) operationTags.push(...operation.tags);
      }
    }
    expect(operationTags).toEqual(
      expect.arrayContaining(['receivables', 'payments']),
    );
  });

  it('documents the standard error envelope on template endpoints', async () => {
    const res = await request(app.getHttpServer())
      .get(`${SWAGGER_PATH}-json`)
      .expect(200);

    const getById = res.body.paths['/api/v1/receivables/{id}'].get;
    const notFound = getById.responses['404'];
    const notFoundSchema = notFound.content['application/json'].schema;
    expect(notFoundSchema.properties.errorCode.example).toBe(
      'RECEIVABLE_NOT_FOUND',
    );
    expect(notFoundSchema.required).toEqual(
      expect.arrayContaining(['statusCode', 'errorCode', 'message']),
    );

    const undo =
      res.body.paths['/api/v1/payments/allocations/{allocationId}/undo'].post;
    expect(undo.responses['404']).toBeDefined();
    expect(undo.responses['409']).toBeDefined();
    expect(undo.responses['201']).toBeDefined();
  });

  it('serves docs without authentication in non-production environments', async () => {
    const res = await request(app.getHttpServer())
      .get(`${SWAGGER_PATH}-json`)
      .expect(200);
    expect(res.headers['www-authenticate']).toBeUndefined();
  });

  it('documents every endpoint with a summary and error responses', async () => {
    const res = await request(app.getHttpServer())
      .get(`${SWAGGER_PATH}-json`)
      .expect(200);

    // Operations that legitimately cannot fail with a business error
    // (no validation DTO, no use-case throws, no guard).
    const NO_ERROR_RESPONSE_ALLOWLIST = new Set([
      'POST /api/v1/auth/logout',
      'GET /api/v1/email-templates',
      'GET /api/v1/reminder-policies',
      'GET /api/v1/bank-transactions/pending-review-count',
    ]);

    interface Operation {
      method: string;
      path: string;
      operation: {
        summary?: string;
        responses?: Record<
          string,
          {
            content?: Record<
              string,
              {
                schema?: {
                  properties?: Record<string, unknown>;
                  required?: string[];
                };
              }
            >;
          }
        >;
      };
    }

    const operations: Operation[] = [];
    for (const [path, methods] of Object.entries(
      res.body.paths as Record<string, Record<string, unknown>>,
    )) {
      if (path === '/health') continue;
      for (const [method, operation] of Object.entries(methods)) {
        if (method === 'parameters') continue;
        operations.push({
          method,
          path,
          operation: operation as Operation['operation'],
        });
      }
    }
    expect(operations.length).toBeGreaterThan(50);

    for (const { method, path, operation } of operations) {
      expect(operation.summary).toBeDefined();

      const key = `${method.toUpperCase()} ${path}`;
      if (NO_ERROR_RESPONSE_ALLOWLIST.has(key)) continue;

      const errorResponses = Object.entries(operation.responses ?? {}).filter(
        ([status]) => status.startsWith('4') || status.startsWith('5'),
      );
      expect(errorResponses.length).toBeGreaterThan(0);

      for (const response of errorResponses.map(([, r]) => r)) {
        const schema = response.content?.['application/json']?.schema;
        expect(schema).toBeDefined();
        expect(schema?.properties?.errorCode).toBeDefined();
        expect(schema?.required).toEqual(
          expect.arrayContaining(['statusCode', 'errorCode', 'message']),
        );
      }
    }
  });
});
