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
import { MembershipInviteOrmEntity } from '../src/modules/auth/infrastructure/membership-invite.orm-entity';
import { RefreshTokenOrmEntity } from '../src/modules/auth/infrastructure/refresh-token.orm-entity';
import { Role } from '../src/modules/organizations/domain/membership';
import { MembershipOrmEntity } from '../src/modules/organizations/infrastructure/membership.orm-entity';
import { OrganizationOrmEntity } from '../src/modules/organizations/infrastructure/organization.orm-entity';
import { UserOrmEntity } from '../src/modules/users/infrastructure/user.orm-entity';

describe('Member management + CSV export (integration)', () => {
  let container: StartedPostgreSqlContainer;
  let app: INestApplication;
  let dataSource: DataSource;
  let jwtService: JwtService;

  const orgA = '00000000-0000-0000-0000-00000000000a';
  const ownerA = '00000000-0000-0000-0000-0000000000a1';
  const accountantA = '00000000-0000-0000-0000-0000000000a2';
  const financeManagerA = '00000000-0000-0000-0000-0000000000a3';
  const inviteId = '00000000-0000-0000-0000-0000000000b1';

  function token(userId: string, organizationId: string, role: Role) {
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
    process.env.JWT_SECRET = 'member-export-e2e-jwt-secret';
    process.env.ACCESS_TOKEN_ENCRYPTION_KEY =
      '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    process.env.RESEND_API_KEY = 'member-export-e2e-resend-key';
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
      .compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    configureApp(app);
    await app.init();
    dataSource = moduleRef.get(DataSource);
    jwtService = moduleRef.get(JwtService);

    await dataSource.getRepository(OrganizationOrmEntity).save({
      id: orgA,
      name: 'Công ty A',
      createdAt: new Date(),
    });
    await dataSource.getRepository(UserOrmEntity).save([
      {
        id: ownerA,
        name: 'Owner A',
        email: 'owner-a@example.com',
        passwordHash: 'h',
        emailVerifiedAt: new Date(),
        createdAt: new Date(),
      },
      {
        id: accountantA,
        name: 'Accountant A',
        email: 'acct-a@example.com',
        passwordHash: 'h',
        emailVerifiedAt: new Date(),
        createdAt: new Date(),
      },
      {
        id: financeManagerA,
        name: 'FM A',
        email: 'fm-a@example.com',
        passwordHash: 'h',
        emailVerifiedAt: new Date(),
        createdAt: new Date(),
      },
    ]);
    await dataSource.getRepository(MembershipOrmEntity).save([
      {
        organizationId: orgA,
        userId: ownerA,
        role: Role.OWNER,
        invitedAt: new Date(),
        joinedAt: new Date(),
        createdAt: new Date(),
      },
      {
        organizationId: orgA,
        userId: accountantA,
        role: Role.ACCOUNTANT,
        invitedAt: new Date(),
        joinedAt: new Date(),
        createdAt: new Date(),
      },
      {
        organizationId: orgA,
        userId: financeManagerA,
        role: Role.FINANCE_MANAGER,
        invitedAt: new Date(),
        joinedAt: new Date(),
        createdAt: new Date(),
      },
    ]);
    await dataSource.getRepository(RefreshTokenOrmEntity).save({
      id: randomUUID(),
      userId: accountantA,
      tokenHash: 'hash-accountant',
      expiresAt: new Date(Date.now() + 60_000),
      createdAt: new Date(),
      revokedAt: null,
    });
    await dataSource.getRepository(MembershipInviteOrmEntity).save({
      id: inviteId,
      organizationId: orgA,
      email: 'invitee@example.com',
      role: Role.VIEWER,
      invitedByUserId: ownerA,
      tokenHash: 'hash-invite',
      expiresAt: new Date(Date.now() + 60_000),
      acceptedAt: null,
      createdAt: new Date(),
    });
  }, 60_000);

  afterAll(async () => {
    await app.close();
    await container.stop();
  });

  it('changes a member role as OWNER', async () => {
    const response = await request(app.getHttpServer())
      .patch(`/api/v1/organizations/${orgA}/members/${accountantA}`)
      .set('Authorization', `Bearer ${token(ownerA, orgA, Role.OWNER)}`)
      .set('Idempotency-Key', randomUUID())
      .send({ role: 'VIEWER' })
      .expect(200);

    expect(response.body.role).toBe('VIEWER');
  });

  it('rejects demoting the last active OWNER', async () => {
    await request(app.getHttpServer())
      .patch(`/api/v1/organizations/${orgA}/members/${ownerA}`)
      .set('Authorization', `Bearer ${token(ownerA, orgA, Role.OWNER)}`)
      .set('Idempotency-Key', randomUUID())
      .send({ role: 'VIEWER' })
      .expect(409);
  });

  it('denies member management to non-OWNER roles', async () => {
    await request(app.getHttpServer())
      .patch(`/api/v1/organizations/${orgA}/members/${accountantA}`)
      .set(
        'Authorization',
        `Bearer ${token(financeManagerA, orgA, Role.FINANCE_MANAGER)}`,
      )
      .send({ role: 'VIEWER' })
      .expect(403);

    await request(app.getHttpServer())
      .delete(`/api/v1/organizations/${orgA}/members/${accountantA}`)
      .set(
        'Authorization',
        `Bearer ${token(financeManagerA, orgA, Role.FINANCE_MANAGER)}`,
      )
      .expect(403);
  });

  it('removes a member and revokes their refresh tokens', async () => {
    await request(app.getHttpServer())
      .delete(`/api/v1/organizations/${orgA}/members/${accountantA}`)
      .set('Authorization', `Bearer ${token(ownerA, orgA, Role.OWNER)}`)
      .set('Idempotency-Key', randomUUID())
      .expect(204);

    const membership = await dataSource
      .getRepository(MembershipOrmEntity)
      .findOne({ where: { organizationId: orgA, userId: accountantA } });
    expect(membership).toBeNull();

    const tokenRow = await dataSource
      .getRepository(RefreshTokenOrmEntity)
      .findOneByOrFail({ userId: accountantA });
    expect(tokenRow.revokedAt).not.toBeNull();
  });

  it('revokes a pending invite', async () => {
    await request(app.getHttpServer())
      .delete(`/api/v1/organizations/${orgA}/invites/${inviteId}`)
      .set('Authorization', `Bearer ${token(ownerA, orgA, Role.OWNER)}`)
      .set('Idempotency-Key', randomUUID())
      .expect(204);

    const invite = await dataSource
      .getRepository(MembershipInviteOrmEntity)
      .findOne({ where: { id: inviteId } });
    expect(invite).toBeNull();
  });

  it('resends an invite with a fresh token', async () => {
    await request(app.getHttpServer())
      .post(`/api/v1/organizations/${orgA}/invites/${inviteId}/resend`)
      .set('Authorization', `Bearer ${token(ownerA, orgA, Role.OWNER)}`)
      .set('Idempotency-Key', randomUUID())
      .expect(404); // deleted in the previous test

    await dataSource.getRepository(MembershipInviteOrmEntity).save({
      id: inviteId,
      organizationId: orgA,
      email: 'invitee@example.com',
      role: Role.VIEWER,
      invitedByUserId: ownerA,
      tokenHash: 'hash-invite',
      expiresAt: new Date(Date.now() + 60_000),
      acceptedAt: null,
      createdAt: new Date(),
    });

    await request(app.getHttpServer())
      .post(`/api/v1/organizations/${orgA}/invites/${inviteId}/resend`)
      .set('Authorization', `Bearer ${token(ownerA, orgA, Role.OWNER)}`)
      .set('Idempotency-Key', randomUUID())
      .expect(200);

    const oldInvite = await dataSource
      .getRepository(MembershipInviteOrmEntity)
      .findOne({ where: { id: inviteId } });
    expect(oldInvite).toBeNull();
    const freshInvite = await dataSource
      .getRepository(MembershipInviteOrmEntity)
      .findOne({
        where: { organizationId: orgA, email: 'invitee@example.com' },
      });
    expect(freshInvite).not.toBeNull();
    expect(freshInvite?.tokenHash).not.toBe('hash-invite');
  });

  it('lists pending invites, excluding accepted ones', async () => {
    await dataSource.getRepository(MembershipInviteOrmEntity).save({
      id: randomUUID(),
      organizationId: orgA,
      email: 'accepted@example.com',
      role: Role.VIEWER,
      invitedByUserId: ownerA,
      tokenHash: 'hash-accepted',
      expiresAt: new Date(Date.now() + 60_000),
      acceptedAt: new Date(),
      createdAt: new Date(),
    });

    const response = await request(app.getHttpServer())
      .get(`/api/v1/organizations/${orgA}/invites`)
      .set('Authorization', `Bearer ${token(ownerA, orgA, Role.OWNER)}`)
      .expect(200);

    expect(response.body.items).toHaveLength(1);
    expect(response.body.items[0].email).toBe('invitee@example.com');
    expect(response.body.items[0]).not.toHaveProperty('tokenHash');
  });

  it('paginates members and filters the result count by status', async () => {
    await dataSource
      .getRepository(MembershipOrmEntity)
      .update(
        { organizationId: orgA, userId: financeManagerA },
        { status: 'BLOCKED', blockedAt: new Date() },
      );

    const response = await request(app.getHttpServer())
      .get(
        `/api/v1/organizations/${orgA}/members?page=1&limit=1&status=BLOCKED`,
      )
      .set('Authorization', `Bearer ${token(ownerA, orgA, Role.OWNER)}`)
      .expect(200);

    expect(response.body).toMatchObject({ total: 1, page: 1, limit: 1 });
    expect(response.body.items).toHaveLength(1);
    expect(response.body.items[0].email).toBe('fm-a@example.com');

    await request(app.getHttpServer())
      .get(`/api/v1/organizations/${orgA}/members?status=PENDING`)
      .set('Authorization', `Bearer ${token(ownerA, orgA, Role.OWNER)}`)
      .expect(400);
  });

  it('exports receivables as an attachment CSV', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/receivables/export')
      .set('Authorization', `Bearer ${token(ownerA, orgA, Role.OWNER)}`)
      .expect(200);

    expect(response.headers['content-type']).toContain('text/csv');
    expect(response.headers['content-disposition']).toContain('attachment');
    expect(response.text).toContain('Mã hóa đơn');
    expect(response.text).toContain('Khách hàng');
  });

  it('exports the aging report as an attachment CSV', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/reports/aging/export')
      .set('Authorization', `Bearer ${token(ownerA, orgA, Role.OWNER)}`)
      .expect(200);

    expect(response.headers['content-type']).toContain('text/csv');
    expect(response.headers['content-disposition']).toContain('attachment');
    expect(response.text).toContain('Nhóm tuổi nợ');
    expect(response.text).toContain('OVERDUE_1_7');
  });
});
