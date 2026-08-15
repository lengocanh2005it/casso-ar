import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
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
import { Role } from '../src/modules/organizations/domain/membership';
import { MembershipOrmEntity } from '../src/modules/organizations/infrastructure/membership.orm-entity';
import { OrganizationOrmEntity } from '../src/modules/organizations/infrastructure/organization.orm-entity';
import { UserOrmEntity } from '../src/modules/users/infrastructure/user.orm-entity';

describe('Membership block/unblock (e2e)', () => {
  let container: StartedPostgreSqlContainer;
  let app: INestApplication;
  let dataSource: DataSource;
  let jwtService: JwtService;

  const organizationId = '55555555-5555-5555-5555-555555555555';
  const ownerId = '66666666-6666-6666-6666-666666666666';
  const memberId = '77777777-7777-7777-7777-777777777777';

  function token(userId: string, role: Role) {
    return jwtService.sign({ userId, organizationId, role });
  }

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:16').start();
    process.env.DB_HOST = container.getHost();
    process.env.DB_PORT = String(container.getMappedPort(5432));
    process.env.DB_USERNAME = container.getUsername();
    process.env.DB_PASSWORD = container.getPassword();
    process.env.DB_DATABASE = container.getDatabase();
    process.env.REDIS_HOST = 'localhost';
    process.env.REDIS_PORT = '6379';
    process.env.JWT_SECRET = 'membership-block-e2e-jwt-secret';
    process.env.ACCESS_TOKEN_ENCRYPTION_KEY =
      '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    process.env.RESEND_API_KEY = 'membership-block-e2e-resend-key';

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
    jwtService = moduleRef.get(JwtService);

    await dataSource.getRepository(OrganizationOrmEntity).save({
      id: organizationId,
      name: 'Acme',
      status: 'ACTIVE',
      createdAt: new Date(),
    });
    await dataSource.getRepository(UserOrmEntity).save([
      {
        id: ownerId,
        name: 'Owner',
        email: 'owner-membership-block-e2e@casso.vn',
        passwordHash: 'h',
        emailVerifiedAt: new Date(),
        isOperator: false,
        createdAt: new Date(),
      },
      {
        id: memberId,
        name: 'Member',
        email: 'member-membership-block-e2e@casso.vn',
        passwordHash: 'h',
        emailVerifiedAt: new Date(),
        isOperator: false,
        createdAt: new Date(),
      },
    ]);
    await dataSource.getRepository(MembershipOrmEntity).save([
      {
        id: randomUUID(),
        organizationId,
        userId: ownerId,
        role: Role.OWNER,
        invitedAt: new Date(),
        joinedAt: new Date(),
        status: 'ACTIVE',
        createdAt: new Date(),
      },
      {
        id: randomUUID(),
        organizationId,
        userId: memberId,
        role: Role.ACCOUNTANT,
        invitedAt: new Date(),
        joinedAt: new Date(),
        status: 'ACTIVE',
        createdAt: new Date(),
      },
    ]);
  }, 60_000);

  afterAll(async () => {
    await app.close();
    await container.stop();
  }, 20_000);

  it('OWNER blocks a member; the member is rejected with MEMBER_BLOCKED on the next request; OWNER unblocks and access returns', async () => {
    const ownerToken = token(ownerId, Role.OWNER);

    await request(app.getHttpServer())
      .post(`/api/v1/organizations/${organizationId}/members/${memberId}/block`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .set('Idempotency-Key', randomUUID())
      .expect(200);

    const blockedMemberToken = token(memberId, Role.ACCOUNTANT);
    const rejected = await request(app.getHttpServer())
      .get('/api/v1/receivables')
      .set('Authorization', `Bearer ${blockedMemberToken}`)
      .expect(403);
    expect(rejected.body.errorCode).toBe('MEMBER_BLOCKED');

    await request(app.getHttpServer())
      .post(
        `/api/v1/organizations/${organizationId}/members/${memberId}/unblock`,
      )
      .set('Authorization', `Bearer ${ownerToken}`)
      .set('Idempotency-Key', randomUUID())
      .expect(200);

    const unblockedMemberToken = token(memberId, Role.ACCOUNTANT);
    await request(app.getHttpServer())
      .get('/api/v1/receivables')
      .set('Authorization', `Bearer ${unblockedMemberToken}`)
      .expect(200);
  });

  it('OWNER cannot block their own membership', async () => {
    const ownerToken = token(ownerId, Role.OWNER);

    const response = await request(app.getHttpServer())
      .post(`/api/v1/organizations/${organizationId}/members/${ownerId}/block`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .set('Idempotency-Key', randomUUID())
      .expect(403);
    expect(response.body.errorCode).toBe('FORBIDDEN');
  });
});
