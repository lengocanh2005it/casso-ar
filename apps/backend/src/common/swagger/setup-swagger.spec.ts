import express from 'express';
import request from 'supertest';
import { buildSwaggerAuthMiddleware } from './setup-swagger';
import { getSwaggerBasicAuthUsers } from './swagger.config';

function buildConfig(values: Record<string, string>) {
  return {
    get: jest.fn(
      (key: string, defaultValue: unknown) => values[key] ?? defaultValue,
    ),
    getOrThrow: jest.fn((key: string) => {
      if (values[key] === undefined) {
        throw new Error(`Missing required env var ${key}`);
      }
      return values[key];
    }),
  };
}

describe('buildSwaggerAuthMiddleware (production gate)', () => {
  function buildApp(values: Record<string, string>) {
    const config = buildConfig(values) as never;
    const app = express();
    const middleware = buildSwaggerAuthMiddleware(config);
    app.use('/api/docs', middleware);
    app.use('/api/docs-json', middleware);
    app.get('/api/docs-json', (_req, res) => res.json({ ok: true }));
    app.get('/api/docs', (_req, res) => res.type('html').end('<html></html>'));
    return app;
  }

  it('rejects unauthenticated requests with 401 + WWW-Authenticate', async () => {
    const app = buildApp({
      SWAGGER_USER: 'docs-admin',
      SWAGGER_PASSWORD: 's3cret',
    });

    const res = await request(app).get('/api/docs-json');

    expect(res.status).toBe(401);
    expect(res.headers['www-authenticate']).toMatch(/Basic/);
  });

  it('rejects wrong credentials', async () => {
    const app = buildApp({
      SWAGGER_USER: 'docs-admin',
      SWAGGER_PASSWORD: 's3cret',
    });

    const res = await request(app)
      .get('/api/docs-json')
      .auth('docs-admin', 'wrong-password');

    expect(res.status).toBe(401);
  });

  it('lets valid credentials through (both UI and -json paths)', async () => {
    const app = buildApp({
      SWAGGER_USER: 'docs-admin',
      SWAGGER_PASSWORD: 's3cret',
    });

    const json = await request(app)
      .get('/api/docs-json')
      .auth('docs-admin', 's3cret');
    expect(json.status).toBe(200);

    const ui = await request(app).get('/api/docs').auth('docs-admin', 's3cret');
    expect(ui.status).toBe(200);
  });

  it('throws when credentials are missing (fail-fast in production)', () => {
    expect(() => buildSwaggerAuthMiddleware(buildConfig({}) as never)).toThrow(
      /SWAGGER_USER/,
    );
  });
});
