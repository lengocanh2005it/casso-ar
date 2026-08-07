import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/configure-app';
import { MembershipInviteOrmEntity } from '../src/modules/auth/infrastructure/membership-invite.orm-entity';
import { PasswordResetTokenOrmEntity } from '../src/modules/auth/infrastructure/password-reset-token.orm-entity';
import { UserOrmEntity } from '../src/modules/users/infrastructure/user.orm-entity';

describe('Auth flow (integration)', () => {
  let container: StartedPostgreSqlContainer;
  let app: INestApplication;
  let dataSource: DataSource;

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:16').start();

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
      .compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    configureApp(app);
    await app.init();
    dataSource = moduleRef.get(DataSource);
  }, 60_000);

  afterAll(async () => {
    await app.close();
    await container.stop();
  });

  it('signup creates the organization, subscription, membership, verification token, and cookie', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/signup')
      .send({
        organizationName: 'Company B',
        name: 'An',
        email: 'ap@congtyb.vn',
        password: 'S3curePass!',
      })
      .expect(201);

    expect(response.body.accessToken).toBeDefined();
    expect(response.body.refreshToken).toBeUndefined();
    expect(response.headers['set-cookie'][0]).toContain('refreshToken=');
    expect(await dataSource.query('SELECT id FROM organizations')).toHaveLength(
      1,
    );
    expect(await dataSource.query('SELECT id FROM subscriptions')).toHaveLength(
      1,
    );
    expect(await dataSource.query('SELECT id FROM memberships')).toHaveLength(
      1,
    );
    expect(
      await dataSource.query('SELECT id FROM email_verification_tokens'),
    ).toHaveLength(1);
  });

  it('verified user can log in and refresh rotates the cookie', async () => {
    await dataSource
      .getRepository(UserOrmEntity)
      .update({ email: 'ap@congtyb.vn' }, { emailVerifiedAt: new Date() });

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

  it('auth rate limiting returns the standard 429 envelope', async () => {
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
});
