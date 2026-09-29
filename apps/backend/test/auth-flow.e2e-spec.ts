import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ThrottlerStorage, ThrottlerStorageService } from '@nestjs/throttler';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';
import cookieParser from 'cookie-parser';
import type { Redis } from 'ioredis';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { RATE_LIMIT_REDIS_CLIENT } from '../src/common/rate-limiting/rate-limit-redis-client.provider';
import { configureApp } from '../src/configure-app';
import { AUTH_EMAIL_SENDER } from '../src/modules/auth/application/auth-email-sender.port';
import { MembershipInviteOrmEntity } from '../src/modules/auth/infrastructure/membership-invite.orm-entity';
import { PasswordResetTokenOrmEntity } from '../src/modules/auth/infrastructure/password-reset-token.orm-entity';
import { TAX_CODE_LOOKUP_ADAPTER } from '../src/modules/tax-verification/application/tax-code-lookup.port';

jest.setTimeout(60_000);

describe('Auth flow (integration)', () => {
  let container: StartedPostgreSqlContainer;
  let app: INestApplication;
  let dataSource: DataSource;
  let throttlerStorage: ThrottlerStorageService;
  let rateLimitRedis: Redis;

  async function clearRateLimitState() {
    throttlerStorage.storage.clear();
    const keys = await rateLimitRedis.keys('abuse-escalation:*');
    if (keys.length > 0) await rateLimitRedis.del(...keys);
  }
  const taxCodeLookup = {
    lookup: jest.fn().mockResolvedValue({ name: 'Company B' }),
  };
  const authEmailSender = {
    sendVerificationEmail: jest.fn(),
    sendPasswordResetEmail: jest.fn(),
    sendChangePasswordOtpEmail: jest.fn(),
    sendInviteEmail: jest.fn(),
  };

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:16').start();
    process.env.DB_HOST = container.getHost();
    process.env.DB_PORT = String(container.getMappedPort(5432));
    process.env.DB_USERNAME = container.getUsername();
    process.env.DB_PASSWORD = container.getPassword();
    process.env.DB_DATABASE = container.getDatabase();
    process.env.RESEND_API_KEY = 'auth-flow-e2e-resend-key';

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
      .overrideProvider(TAX_CODE_LOOKUP_ADAPTER)
      .useValue(taxCodeLookup)
      .overrideProvider(AUTH_EMAIL_SENDER)
      .useValue(authEmailSender)
      .compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    configureApp(app);
    await app.init();
    dataSource = moduleRef.get(DataSource);
    throttlerStorage = moduleRef.get<ThrottlerStorageService>(ThrottlerStorage);
    rateLimitRedis = moduleRef.get<Redis>(RATE_LIMIT_REDIS_CLIENT);
  }, 60_000);

  afterAll(async () => {
    await app.close();
    await container.stop();
  });

  it('signup creates a pending signup, and verifying it provisions the organization and issues a session', async () => {
    const signupResponse = await request(app.getHttpServer())
      .post('/api/v1/auth/signup')
      .send({
        organizationName: 'Company B',
        name: 'An',
        email: 'ap@congtyb.vn',
        password: 'S3curePass!',
        taxCode: '0123456789',
      })
      .expect(201);

    expect(signupResponse.body).toEqual({ success: true });
    expect(
      await dataSource.query('SELECT id FROM pending_signups'),
    ).toHaveLength(1);
    expect(await dataSource.query('SELECT id FROM organizations')).toHaveLength(
      0,
    );
    expect(await dataSource.query('SELECT id FROM subscriptions')).toHaveLength(
      0,
    );
    expect(await dataSource.query('SELECT id FROM memberships')).toHaveLength(
      0,
    );
    expect(authEmailSender.sendVerificationEmail).toHaveBeenCalledWith(
      'ap@congtyb.vn',
      expect.stringMatching(/^\d{6}$/),
    );

    const otp = authEmailSender.sendVerificationEmail.mock
      .calls[0][1] as string;

    // New organizations start PENDING_REVIEW (Casso admin approval gate) —
    // verify-email still provisions the org/user/membership/subscription,
    // but LoginUseCase.executeForUser now blocks the session until an
    // operator approves it, so this call gets 403, not a session.
    const verifyResponse = await request(app.getHttpServer())
      .post('/api/v1/auth/verify-email')
      .send({ email: 'ap@congtyb.vn', otp })
      .expect(403);

    expect(verifyResponse.body.errorCode).toBe('ORGANIZATION_PENDING_REVIEW');
    expect(
      await dataSource.query('SELECT id FROM pending_signups'),
    ).toHaveLength(0);
    expect(await dataSource.query('SELECT id FROM organizations')).toHaveLength(
      1,
    );
    expect(await dataSource.query('SELECT id FROM subscriptions')).toHaveLength(
      1,
    );
    expect(await dataSource.query('SELECT id FROM memberships')).toHaveLength(
      1,
    );

    // Simulate an operator approving the org so later tests in this file
    // (login, refresh, invites) can exercise the authenticated flow —
    // approval itself is covered by the admin module's own tests.
    await dataSource.query(
      `UPDATE organizations SET status = 'ACTIVE' WHERE name = 'Company B'`,
    );
  });

  it('rejects a second signup for the same email while one is still pending', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/auth/signup')
      .send({
        organizationName: 'Company D',
        name: 'Cuong',
        email: 'cuong@congtyd.vn',
        password: 'S3curePass!',
        taxCode: '0999999998',
      })
      .expect(201);

    const conflict = await request(app.getHttpServer())
      .post('/api/v1/auth/signup')
      .send({
        organizationName: 'Company D Retry',
        name: 'Cuong',
        email: 'cuong@congtyd.vn',
        password: 'S3curePass!',
        taxCode: '0999999997',
      })
      .expect(409);

    expect(conflict.body.errorCode).toBe('CONFLICT');
  });

  it('verified user can log in and refresh rotates the cookie', async () => {
    const invalidLogin = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'ap@congtyb.vn', password: 'wrong-password' })
      .expect(401);
    expect(invalidLogin.body).toMatchObject({
      statusCode: 401,
      errorCode: 'UNAUTHORIZED',
    });

    const loginResponse = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'ap@congtyb.vn', password: 'S3curePass!' })
      .expect(201);
    const cookie = loginResponse.headers['set-cookie'][0];

    const refreshResponse = await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .set('Cookie', cookie)
      .expect(201);

    expect(refreshResponse.body.accessToken).toBeDefined();
    expect(refreshResponse.headers['set-cookie'][0]).toContain('refreshToken=');
    expect(
      await dataSource.query(
        'SELECT id FROM refresh_tokens WHERE "revokedAt" IS NOT NULL',
      ),
    ).not.toHaveLength(0);
  });

  describe('refresh token reuse (rotation grace window)', () => {
    async function loginCookie(): Promise<string> {
      await clearRateLimitState();
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: 'ap@congtyb.vn', password: 'S3curePass!' })
        .expect(201);
      return response.headers['set-cookie'][0];
    }

    function refreshWith(cookie: string) {
      return request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .set('Cookie', cookie);
    }

    it('serves a just-rotated token again with a fresh session and keeps the family alive', async () => {
      const original = await loginCookie();
      const rotated = await refreshWith(original).expect(201);

      const replay = await refreshWith(original).expect(201);

      expect(replay.headers['set-cookie'][0]).toContain('refreshToken=');
      expect(replay.headers['set-cookie'][0]).not.toBe(original);
      expect(replay.headers['set-cookie'][0]).not.toBe(
        rotated.headers['set-cookie'][0],
      );
      await refreshWith(rotated.headers['set-cookie'][0]).expect(201);
    });

    it('logs each grace issuance at warn level with the user and request ids', async () => {
      const original = await loginCookie();
      await refreshWith(original).expect(201);
      const stdout = jest.spyOn(process.stdout, 'write');

      await refreshWith(original).expect(201);

      const entries = stdout.mock.calls
        .map(([chunk]) => String(chunk))
        .filter((line) => line.startsWith('{'))
        .map((line) => JSON.parse(line) as Record<string, unknown>);
      stdout.mockRestore();
      const [user] = await dataSource.query(
        `SELECT id FROM users WHERE email = 'ap@congtyb.vn'`,
      );
      expect(entries).toContainEqual(
        expect.objectContaining({
          level: 'warn',
          message: 'Refresh token reused within rotation grace window',
          refreshTokenUserId: user.id,
          requestId: expect.any(String),
        }),
      );
    });

    it('treats reuse after the grace window as theft and revokes the family', async () => {
      const original = await loginCookie();
      const rotated = await refreshWith(original).expect(201);
      // Age every token past the 10 s window; the rotation happened "11 s ago".
      await dataSource.query(
        `UPDATE refresh_tokens SET "createdAt" = "createdAt" - interval '11 seconds'`,
      );

      await refreshWith(original).expect(401);

      await refreshWith(rotated.headers['set-cookie'][0]).expect(401);
    });

    it('does not mint a session from a token rotated before the user logged out', async () => {
      const original = await loginCookie();
      const rotated = await refreshWith(original).expect(201);
      await request(app.getHttpServer())
        .post('/api/v1/auth/logout')
        .set('Cookie', rotated.headers['set-cookie'][0])
        .expect(200);
      const otherDevice = await loginCookie();

      await refreshWith(original).expect(401);

      // Theft detection ran: the user's other sessions are revoked too.
      await refreshWith(otherDevice).expect(401);
    });

    it('serves two simultaneous refreshes carrying the same cookie', async () => {
      const original = await loginCookie();

      const [first, second] = await Promise.all([
        refreshWith(original),
        refreshWith(original),
      ]);

      expect([first.status, second.status]).toEqual([201, 201]);
      expect(first.headers['set-cookie'][0]).not.toBe(
        second.headers['set-cookie'][0],
      );
    });

    it('still revokes the family when a logged-out token is presented again', async () => {
      const cookie = await loginCookie();
      await request(app.getHttpServer())
        .post('/api/v1/auth/logout')
        .set('Cookie', cookie)
        .expect(200);
      const otherDevice = await loginCookie();

      await refreshWith(cookie).expect(401);

      await refreshWith(otherDevice).expect(401);
    });
  });

  it('email dimension rate-limits login and returns the standard 429 envelope', async () => {
    await clearRateLimitState();

    for (let attempt = 0; attempt < 5; attempt += 1) {
      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: 'rate-limit@example.com', password: 'wrong-password' })
        .expect(401);
    }

    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'rate-limit@example.com', password: 'wrong-password' })
      .expect(429);
    expect(response.body).toMatchObject({
      statusCode: 429,
      errorCode: 'RATE_LIMIT_EXCEEDED',
    });
  });

  it('forgot-password returns 200 for known and unknown emails', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/auth/forgot-password')
      .send({ email: 'ap@congtyb.vn' })
      .expect(200);
    await request(app.getHttpServer())
      .post('/api/v1/auth/forgot-password')
      .send({ email: 'does-not-exist@nowhere.vn' })
      .expect(200);

    expect(
      await dataSource.getRepository(PasswordResetTokenOrmEntity).count(),
    ).toBe(1);
  });

  it('invite creates a hashed invite for the authenticated owner', async () => {
    const loginResponse = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'ap@congtyb.vn', password: 'S3curePass!' })
      .expect(201);
    const organization = (
      await dataSource.query('SELECT id FROM organizations')
    )[0];

    await request(app.getHttpServer())
      .post(`/api/v1/organizations/${organization.id}/invites`)
      .set('Authorization', `Bearer ${loginResponse.body.accessToken}`)
      .send({ email: 'new-member@congtyb.vn', role: 'ACCOUNTANT' })
      .expect(201);

    const invite = await dataSource
      .getRepository(MembershipInviteOrmEntity)
      .findOne({ where: { email: 'new-member@congtyb.vn' } });
    expect(invite?.tokenHash).toHaveLength(64);
  });

  it('returns the resolved organization name without authentication', async () => {
    taxCodeLookup.lookup.mockResolvedValueOnce({ name: 'Company B' });

    await request(app.getHttpServer())
      .get('/api/v1/tax-verification/lookup')
      .query({ taxCode: '0123456789' })
      .expect(200)
      .expect({ name: 'Company B' });
  });

  it('returns null when the tax code is not resolved', async () => {
    taxCodeLookup.lookup.mockResolvedValueOnce(null);

    await request(app.getHttpServer())
      .get('/api/v1/tax-verification/lookup')
      .query({ taxCode: '0123456789' })
      .expect(200)
      .expect({ name: null });
  });

  it('rejects an invalid tax-code query before calling the adapter', async () => {
    taxCodeLookup.lookup.mockClear();

    const response = await request(app.getHttpServer())
      .get('/api/v1/tax-verification/lookup')
      .query({ taxCode: '123' })
      .expect(400);

    expect(response.body).toMatchObject({
      statusCode: 400,
      errorCode: 'VALIDATION_ERROR',
    });
    expect(taxCodeLookup.lookup).not.toHaveBeenCalled();
  });

  it('tax-code lookup rate-limits after 5 requests per IP', async () => {
    await clearRateLimitState();

    for (let attempt = 0; attempt < 5; attempt += 1) {
      await request(app.getHttpServer())
        .get('/api/v1/tax-verification/lookup')
        .query({ taxCode: '0123456789' })
        .expect(200);
    }

    const response = await request(app.getHttpServer())
      .get('/api/v1/tax-verification/lookup')
      .query({ taxCode: '0123456789' })
      .expect(429);

    expect(response.body).toMatchObject({
      statusCode: 429,
      errorCode: 'RATE_LIMIT_EXCEEDED',
    });
  });

  it('IP dimension rate-limits lookup after 20 requests regardless of tax code', async () => {
    await clearRateLimitState();

    for (let attempt = 0; attempt < 20; attempt += 1) {
      await request(app.getHttpServer())
        .get('/api/v1/tax-verification/lookup')
        .query({ taxCode: `0900000${String(attempt).padStart(3, '0')}` })
        .expect(200);
    }

    const response = await request(app.getHttpServer())
      .get('/api/v1/tax-verification/lookup')
      .query({ taxCode: '0999999999' })
      .expect(429);

    expect(response.body).toMatchObject({
      statusCode: 429,
      errorCode: 'RATE_LIMIT_EXCEEDED',
    });
  });

  it('tax-code dimension rate-limits signup independently of the email dimension', async () => {
    await clearRateLimitState();

    for (let attempt = 0; attempt < 5; attempt += 1) {
      await request(app.getHttpServer())
        .post('/api/v1/auth/signup')
        .send({
          organizationName: 'Company E',
          name: 'Emi',
          email: `emi${attempt}@congtye.vn`,
          password: 'S3curePass!',
          taxCode: '0777777770',
        })
        .expect((res) => {
          expect([201, 409]).toContain(res.status);
        });
    }

    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/signup')
      .send({
        organizationName: 'Company E',
        name: 'Emi',
        email: 'emi-final@congtye.vn',
        password: 'S3curePass!',
        taxCode: '0777777770',
      })
      .expect(429);

    expect(response.body).toMatchObject({
      statusCode: 429,
      errorCode: 'RATE_LIMIT_EXCEEDED',
    });
  });

  // TODO(#364): this test's math doesn't match any currently-configured
  // throttler. It sends 5 baseline + 3 "violation" tax-verification/lookup
  // requests, each with a DISTINCT taxCode, expecting the violation calls to
  // individually 429 and escalate to a lockout. But the route has no
  // per-route @Throttle override — it only sits under the global 'ip'
  // (limit 20/15min), 'email' (skipIf no email — always skipped here), and
  // 'taxCode' (limit 5/hour, scoped PER VALUE, so distinct codes never
  // accumulate) throttlers. None of those trip on 9 total, all-distinct-code
  // requests, so AuthCompositeRateLimitGuard's escalation counter (which
  // only increments when the base ThrottlerGuard actually throws) never
  // fires either. Needs a product decision on what should actually trigger
  // an IP lockout here (a dedicated low-limit per-route throttle? a
  // request-count-regardless-of-taxCode dimension?) before this can be
  // fixed for real, rather than reverse-engineered to match whatever the
  // guard happens to do today.
  it.skip('escalates an IP to a lockout after repeated throttled attempts', async () => {
    await clearRateLimitState();

    for (let attempt = 0; attempt < 5; attempt += 1) {
      await request(app.getHttpServer())
        .get('/api/v1/tax-verification/lookup')
        .query({ taxCode: `080000000${attempt}` })
        .expect(200);
    }
    for (let violation = 0; violation < 3; violation += 1) {
      await request(app.getHttpServer())
        .get('/api/v1/tax-verification/lookup')
        .query({ taxCode: `081111111${violation}` })
        .expect(429);
    }

    const response = await request(app.getHttpServer())
      .get('/api/v1/tax-verification/lookup')
      .query({ taxCode: '0822222222' })
      .expect(429);

    expect(response.body).toMatchObject({
      statusCode: 429,
      errorCode: 'RATE_LIMIT_EXCEEDED',
    });
  });
});
