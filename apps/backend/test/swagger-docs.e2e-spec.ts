import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
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
import type { StartedTestContainer } from 'testcontainers';
import * as ts from 'typescript';
import { AppModule } from '../src/app.module';
import { ErrorCode } from '../src/common/errors/error-code';
import {
  SWAGGER_PATH,
  setupSwagger,
} from '../src/common/swagger/setup-swagger';
import { configureApp } from '../src/configure-app';
import { WEBHOOK_JOB_QUEUE } from '../src/modules/webhooks/application/webhook-job-queue.port';
import { startTestRedis } from './helpers/test-redis';

jest.setTimeout(60_000);

interface IdempotentOperation {
  method: string;
  path: string;
}

interface OpenApiErrorSchema {
  properties?: Record<string, { enum?: unknown[]; example?: unknown }>;
  required?: string[];
}

interface OpenApiOperation {
  parameters?: Array<{ in?: string; name?: string; required?: boolean }>;
  responses?: Record<
    string,
    {
      content?: { 'application/json'?: { schema?: OpenApiErrorSchema } };
      description?: string;
    }
  >;
}

const HTTP_METHODS: Record<string, string> = {
  Delete: 'delete',
  Patch: 'patch',
  Post: 'post',
  Put: 'put',
};
// Make changes to the wrapped-route inventory explicit in this contract test.
const EXPECTED_IDEMPOTENT_ROUTE_COUNT = 57;

function decoratorCall(
  node: ts.Node,
  name: string,
): ts.CallExpression | undefined {
  const decorators = ts.canHaveDecorators(node)
    ? (ts.getDecorators(node) ?? [])
    : [];
  return decorators
    .map((decorator) => decorator.expression)
    .find(
      (expression): expression is ts.CallExpression =>
        ts.isCallExpression(expression) &&
        ((ts.isIdentifier(expression.expression) &&
          expression.expression.text === name) ||
          (ts.isPropertyAccessExpression(expression.expression) &&
            expression.expression.name.text === name)),
    );
}

function staticRoutePaths(expression?: ts.Expression): string[] {
  if (!expression) return [''];
  if (ts.isStringLiteralLike(expression)) return [expression.text];
  if (ts.isArrayLiteralExpression(expression)) {
    return expression.elements.map((element) => {
      if (!ts.isStringLiteralLike(element)) {
        throw new Error(
          `Expected a static route path, got ${element.getText()}`,
        );
      }
      return element.text;
    });
  }
  throw new Error(
    `Expected a static controller route, got ${expression.getText()}`,
  );
}

function idempotencyProperty(
  classDeclaration: ts.ClassDeclaration,
): string | undefined {
  const constructorDeclaration = classDeclaration.members.find(
    ts.isConstructorDeclaration,
  );
  const parameter = constructorDeclaration?.parameters.find(
    (candidate) =>
      candidate.type?.getText().split('.').at(-1) === 'IdempotencyService',
  );
  return parameter && ts.isIdentifier(parameter.name)
    ? parameter.name.text
    : undefined;
}

function usesIdempotency(
  method: ts.MethodDeclaration,
  serviceProperty: string,
): boolean {
  let found = false;
  const visit = (node: ts.Node) => {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      ['execute', 'executeForOrganization'].includes(node.expression.name.text)
    ) {
      const receiver = node.expression.expression;
      if (
        ts.isPropertyAccessExpression(receiver) &&
        receiver.expression.kind === ts.SyntaxKind.ThisKeyword &&
        receiver.name.text === serviceProperty
      ) {
        found = true;
      }
    }
    ts.forEachChild(node, visit);
  };
  if (method.body) visit(method.body);
  return found;
}

function findControllerFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return findControllerFiles(path);
    return entry.isFile() && entry.name.endsWith('.controller.ts')
      ? [path]
      : [];
  });
}

function findIdempotentOperations(): IdempotentOperation[] {
  // Scan controller calls instead of maintaining a list of wrapped routes.
  const sourceDirectory = join(__dirname, '../src/modules');
  const operations: IdempotentOperation[] = [];

  for (const filePath of findControllerFiles(sourceDirectory)) {
    const source = ts.createSourceFile(
      filePath,
      readFileSync(filePath, 'utf8'),
      ts.ScriptTarget.Latest,
      true,
    );

    for (const statement of source.statements) {
      if (!ts.isClassDeclaration(statement)) continue;
      const serviceProperty = idempotencyProperty(statement);
      if (!serviceProperty) continue;
      const controllerPaths = staticRoutePaths(
        decoratorCall(statement, 'Controller')?.arguments[0],
      );

      for (const member of statement.members) {
        if (
          !ts.isMethodDeclaration(member) ||
          !usesIdempotency(member, serviceProperty)
        ) {
          continue;
        }

        for (const [decoratorName, method] of Object.entries(HTTP_METHODS)) {
          const route = decoratorCall(member, decoratorName);
          if (!route) continue;
          for (const controllerPrefix of controllerPaths) {
            for (const methodPath of staticRoutePaths(route.arguments[0])) {
              const path = ['api/v1', controllerPrefix, methodPath]
                .map((part) => part.replace(/^\/+|\/+$/g, ''))
                .filter(Boolean)
                .join('/')
                .replace(/:([A-Za-z0-9_]+)/g, '{$1}');
              operations.push({ method, path: `/${path}` });
            }
          }
        }
      }
    }
  }

  return operations;
}

describe('Swagger / OpenAPI docs (integration)', () => {
  let container: StartedPostgreSqlContainer;
  let redis: StartedTestContainer;
  let app: INestApplication;

  beforeAll(async () => {
    redis = await startTestRedis();
    container = await new PostgreSqlContainer('postgres:16').start();
    process.env.DB_HOST = container.getHost();
    process.env.DB_PORT = String(container.getMappedPort(5432));
    process.env.DB_USERNAME = container.getUsername();
    process.env.DB_PASSWORD = container.getPassword();
    process.env.DB_DATABASE = container.getDatabase();
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
    await Promise.all([redis.stop(), container.stop()]);
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
    expect(res.body.info.title).toBe('Casso AR API');
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

  it('documents the receivable balance history audit endpoints and CSV export', async () => {
    const res = await request(app.getHttpServer())
      .get(`${SWAGGER_PATH}-json`)
      .expect(200);

    const list = res.body.paths['/api/v1/receivable-balance-history'].get;
    expect(list).toBeDefined();
    expect(list.summary).toBeDefined();
    expect(
      list.parameters.some((p: { name: string }) => p.name === 'page'),
    ).toBe(true);
    expect(
      list.parameters.some((p: { name: string }) => p.name === 'limit'),
    ).toBe(true);
    expect(
      list.parameters.some((p: { name: string }) => p.name === 'status'),
    ).toBe(true);
    expect(list.responses['200']).toBeDefined();
    expect(list.responses['403']).toBeDefined();

    const summary =
      res.body.paths['/api/v1/receivable-balance-history/summary'].get;
    expect(summary).toBeDefined();
    expect(summary.responses['200'].content['application/json']).toBeDefined();

    const exportOp =
      res.body.paths['/api/v1/receivable-balance-history/export'].get;
    expect(exportOp).toBeDefined();
    expect(exportOp.responses['200'].content['text/csv'].schema).toEqual({
      type: 'string',
      format: 'binary',
    });
    expect(exportOp.responses['429']).toBeDefined();
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

  it('documents required idempotency keys and their missing-key response on every wrapped route', async () => {
    const res = await request(app.getHttpServer())
      .get(`${SWAGGER_PATH}-json`)
      .expect(200);
    const operations = findIdempotentOperations();
    expect(operations).toHaveLength(EXPECTED_IDEMPOTENT_ROUTE_COUNT);

    for (const { method, path } of operations) {
      const operation = res.body.paths[path]?.[method] as
        | OpenApiOperation
        | undefined;
      expect(operation).toBeDefined();

      const idempotencyHeader = operation?.parameters?.find(
        (parameter) =>
          parameter.in === 'header' &&
          parameter.name?.toLowerCase() === 'idempotency-key',
      );
      expect(idempotencyHeader?.required).toBe(true);

      const missingKeySchema =
        operation?.responses?.['409']?.content?.['application/json']?.schema;
      expect(missingKeySchema).toBeDefined();
      expect(missingKeySchema?.properties?.statusCode?.example).toBe(409);
      expect(missingKeySchema?.properties?.errorCode?.example).toBe(
        'VALIDATION_ERROR',
      );
      expect(missingKeySchema?.required).toEqual(
        expect.arrayContaining(['statusCode', 'errorCode', 'message']),
      );
    }
  });

  it('preserves existing 409 error codes on idempotent routes', async () => {
    const res = await request(app.getHttpServer())
      .get(`${SWAGGER_PATH}-json`)
      .expect(200);

    const allocate = res.body.paths['/api/v1/payments/{id}/allocate']
      .post as OpenApiOperation;
    const conflictResponse = allocate.responses?.['409'];
    const errorCodeSchema =
      conflictResponse?.content?.['application/json']?.schema?.properties
        ?.errorCode;

    expect(conflictResponse?.description).toContain(ErrorCode.CONFLICT);
    expect(conflictResponse?.description).toContain(
      ErrorCode.IDEMPOTENCY_KEY_REUSED,
    );
    expect(errorCodeSchema?.enum).toEqual(
      expect.arrayContaining([
        ErrorCode.VALIDATION_ERROR,
        ErrorCode.CONFLICT,
        ErrorCode.IDEMPOTENCY_KEY_REUSED,
      ]),
    );
  });
});
