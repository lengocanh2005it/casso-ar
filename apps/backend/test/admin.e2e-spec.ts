import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/configure-app';
import { hashPassword } from '../src/modules/auth/application/password-hasher';
import { Role } from '../src/modules/organizations/domain/membership';
import { MembershipOrmEntity } from '../src/modules/organizations/infrastructure/membership.orm-entity';
import { OrganizationOrmEntity } from '../src/modules/organizations/infrastructure/organization.orm-entity';
import { UserOrmEntity } from '../src/modules/users/infrastructure/user.orm-entity';

describe('Admin (e2e)', () => {
  let container: StartedPostgreSqlContainer;
  let app: INestApplication;
  let dataSource: DataSource;
  let operatorToken: string;

  const organizationId = '11111111-1111-1111-1111-111111111111';
  const operatorId = '22222222-2222-2222-2222-222222222222';

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:16').start();
    process.env.DB_HOST = container.getHost();
    process.env.DB_PORT = String(container.getMappedPort(5432));
    process.env.DB_USERNAME = container.getUsername();
    process.env.DB_PASSWORD = container.getPassword();
    process.env.DB_DATABASE = container.getDatabase();
    process.env.REDIS_HOST = 'localhost';
    process.env.REDIS_PORT = '6379';
    process.env.JWT_SECRET = 'admin-e2e-jwt-secret';
    process.env.RESEND_API_KEY = 'admin-e2e-resend-key';
    process.env.ACCESS_TOKEN_ENCRYPTION_KEY =
      '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

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
    configureApp(app);
    await app.init();
    dataSource = moduleRef.get(DataSource);

    await dataSource.getRepository(OrganizationOrmEntity).save({
      id: organizationId,
      name: 'Acme',
      status: 'ACTIVE',
      createdAt: new Date(),
    });
    await dataSource.getRepository(UserOrmEntity).save({
      id: operatorId,
      name: 'Operator',
      email: 'operator-admin-e2e@casso.vn',
      passwordHash: await hashPassword('Password123!'),
      emailVerifiedAt: new Date(),
      isOperator: true,
      createdAt: new Date(),
    });

    const loginResponse = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        email: 'operator-admin-e2e@casso.vn',
        password: 'Password123!',
      })
      .expect(201);
    operatorToken = loginResponse.body.accessToken;
  }, 60_000);

  afterAll(async () => {
    await Promise.race([
      app.close(),
      new Promise<void>((resolve) => setTimeout(resolve, 5_000)),
    ]);
    await Promise.race([
      container.stop(),
      new Promise<void>((resolve) => setTimeout(resolve, 5_000)),
    ]);
  }, 20_000);

  it('rejects /admin/organizations without an operator token', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/admin/organizations')
      .expect(401);
  });

  it('locks and unlocks an organization with operator authorization', async () => {
    const orgsResponse = await request(app.getHttpServer())
      .get('/api/v1/admin/organizations?page=1&limit=1')
      .set('Authorization', `Bearer ${operatorToken}`)
      .expect(200);
    expect(orgsResponse.body.items[0]).toMatchObject({
      id: organizationId,
      name: 'Acme',
      status: 'ACTIVE',
    });

    await request(app.getHttpServer())
      .post(`/api/v1/admin/organizations/${organizationId}/lock`)
      .set('Authorization', `Bearer ${operatorToken}`)
      .expect(201, { status: 'LOCKED' });
    expect(
      await dataSource.getRepository(OrganizationOrmEntity).findOneBy({
        id: organizationId,
      }),
    ).toMatchObject({ status: 'LOCKED' });

    await request(app.getHttpServer())
      .post(`/api/v1/admin/organizations/${organizationId}/lock`)
      .set('Authorization', `Bearer ${operatorToken}`)
      .expect(201, { status: 'LOCKED' });

    await request(app.getHttpServer())
      .post(`/api/v1/admin/organizations/${organizationId}/unlock`)
      .set('Authorization', `Bearer ${operatorToken}`)
      .expect(201, { status: 'ACTIVE' });
  });

  describe('member block/unblock', () => {
    const memberId = '33333333-3333-3333-3333-333333333333';
    const membershipId = '44444444-4444-4444-4444-444444444444';

    beforeAll(async () => {
      await dataSource.getRepository(UserOrmEntity).save({
        id: memberId,
        name: 'Member',
        email: 'member-admin-e2e@casso.vn',
        passwordHash: await hashPassword('Password123!'),
        emailVerifiedAt: new Date(),
        isOperator: false,
        createdAt: new Date(),
      });
      await dataSource.getRepository(MembershipOrmEntity).save({
        id: membershipId,
        organizationId,
        userId: memberId,
        role: Role.ACCOUNTANT,
        invitedAt: new Date(),
        joinedAt: new Date(),
        status: 'ACTIVE',
        createdAt: new Date(),
      });
    });

    it('blocks and unblocks a member, idempotently', async () => {
      await request(app.getHttpServer())
        .post(
          `/api/v1/admin/organizations/${organizationId}/members/${memberId}/block`,
        )
        .set('Authorization', `Bearer ${operatorToken}`)
        .expect(201)
        .expect({ status: 'BLOCKED' });

      await request(app.getHttpServer())
        .post(
          `/api/v1/admin/organizations/${organizationId}/members/${memberId}/block`,
        )
        .set('Authorization', `Bearer ${operatorToken}`)
        .expect(201)
        .expect({ status: 'BLOCKED' });

      await request(app.getHttpServer())
        .post(
          `/api/v1/admin/organizations/${organizationId}/members/${memberId}/unblock`,
        )
        .set('Authorization', `Bearer ${operatorToken}`)
        .expect(201)
        .expect({ status: 'ACTIVE' });
    });
  });

  it('rejects the aggregate ai-usage endpoint when from/to are missing', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/admin/ai-usage')
      .set('Authorization', `Bearer ${operatorToken}`)
      .expect(400);
  });
});
