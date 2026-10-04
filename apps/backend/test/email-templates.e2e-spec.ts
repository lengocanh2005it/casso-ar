import type { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';
import request from 'supertest';
import type { StartedTestContainer } from 'testcontainers';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/configure-app';
import { AUTH_EMAIL_SENDER } from '../src/modules/auth/application/auth-email-sender.port';
import { EMAIL_PROVIDER_ADAPTER } from '../src/modules/notifications/application/email-provider-adapter.port';
import { Role } from '../src/modules/organizations/domain/membership';
import { MembershipOrmEntity } from '../src/modules/organizations/infrastructure/membership.orm-entity';
import { TAX_CODE_LOOKUP_ADAPTER } from '../src/modules/tax-verification/application/tax-code-lookup.port';
import { UserOrmEntity } from '../src/modules/users/infrastructure/user.orm-entity';
import { startTestRedis } from './helpers/test-redis';

const fakeEmailProvider = {
  send: jest.fn().mockResolvedValue({ providerMessageId: 'fake-msg-id' }),
};

const authEmailSender = {
  sendVerificationEmail: jest.fn(),
  sendPasswordResetEmail: jest.fn(),
  sendChangePasswordOtpEmail: jest.fn(),
  sendInviteEmail: jest.fn(),
};

jest.setTimeout(60_000);

describe('Email Template Management (integration)', () => {
  let container: StartedPostgreSqlContainer;
  let redis: StartedTestContainer;
  let app: INestApplication;
  let dataSource: DataSource;
  let jwtService: JwtService;
  let organizationId: string;
  let ownerId: string;

  function tokenFor(userId: string, role: string): string {
    return jwtService.sign({ userId, organizationId, role });
  }

  beforeAll(async () => {
    redis = await startTestRedis();
    container = await new PostgreSqlContainer('postgres:16').start();
    process.env.DB_HOST = container.getHost();
    process.env.DB_PORT = String(container.getMappedPort(5432));
    process.env.DB_USERNAME = container.getUsername();
    process.env.DB_PASSWORD = container.getPassword();
    process.env.DB_DATABASE = container.getDatabase();
    process.env.JWT_SECRET = 'e2e-jwt-secret';
    process.env.ACCESS_TOKEN_ENCRYPTION_KEY =
      '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    process.env.RESEND_API_KEY = 'e2e-resend-key';
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
      .overrideProvider(EMAIL_PROVIDER_ADAPTER)
      .useValue(fakeEmailProvider)
      .overrideProvider(AUTH_EMAIL_SENDER)
      .useValue(authEmailSender)
      .overrideProvider(TAX_CODE_LOOKUP_ADAPTER)
      .useValue({
        lookup: jest.fn().mockResolvedValue({ name: 'Test Company' }),
      })
      .compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    dataSource = moduleRef.get(DataSource);
    jwtService = moduleRef.get(JwtService);
  }, 60_000);

  afterAll(async () => {
    await app.close();
    await Promise.all([redis.stop(), container.stop()]);
  });

  it('seeds 4 default templates when a new Organization signs up', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/auth/signup')
      .send({
        organizationName: 'Test Company',
        name: 'Owner Name',
        email: 'owner@test-org.vn',
        password: 'S3curePass!',
        taxCode: '0123456789',
      })
      .expect(201);

    // Signup only creates a pending_signups row; verify-email is what
    // provisions the organization/user/membership/subscription. It still
    // does so even though the new org starts PENDING_REVIEW and blocks the
    // login session that would normally follow (403 here is expected, not
    // a failure).
    const otp = authEmailSender.sendVerificationEmail.mock
      .calls[0][1] as string;
    await request(app.getHttpServer())
      .post('/api/v1/auth/verify-email')
      .send({ email: 'owner@test-org.vn', otp })
      .expect(403);

    ownerId = (
      await dataSource.query('SELECT id FROM users WHERE email = $1', [
        'owner@test-org.vn',
      ])
    )[0].id;
    organizationId = (
      await dataSource.query(
        'SELECT "organizationId" FROM memberships WHERE "userId" = $1',
        [ownerId],
      )
    )[0].organizationId;

    // OrganizationLockGuard blocks every authenticated endpoint (not just
    // login) while PENDING_REVIEW — simulate operator approval so the rest
    // of this suite can exercise the authenticated CRUD flow the same way
    // billing-quota.e2e-spec.ts's direct-fixture shortcut does.
    await dataSource.query(
      `UPDATE organizations SET status = 'ACTIVE' WHERE id = $1`,
      [organizationId],
    );

    const token = tokenFor(ownerId, Role.OWNER);

    const listResponse = await request(app.getHttpServer())
      .get('/api/v1/email-templates')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(listResponse.body).toHaveLength(4);
    expect(
      listResponse.body.every(
        (t: { isDefault: boolean }) => t.isDefault === true,
      ),
    ).toBe(true);
  });

  it('creates, previews, updates, and deletes a custom email template end-to-end', async () => {
    const token = tokenFor(ownerId, Role.OWNER);

    const createResponse = await request(app.getHttpServer())
      .post('/api/v1/email-templates')
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', 'create-template-1')
      .send({
        name: 'Custom Payment Reminder',
        subject: 'Hello {{customerName}}',
        bodyHtml:
          '<p>{{customerName}} still owes {{remainingAmount}} for invoice {{invoiceNumber}}</p>',
      })
      .expect(201);

    const templateId = createResponse.body.id;
    expect(createResponse.body.isDefault).toBe(false);

    const previewResponse = await request(app.getHttpServer())
      .post(`/api/v1/email-templates/${templateId}/preview`)
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', 'preview-template-1')
      .expect(201);

    expect(previewResponse.body.subject).toBe('Hello ABC Company Ltd.');
    expect(previewResponse.body.bodyHtml).toContain('ABC Company Ltd.');

    await request(app.getHttpServer())
      .patch(`/api/v1/email-templates/${templateId}`)
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', 'update-template-1')
      .send({ subject: 'Updated: {{invoiceNumber}}' })
      .expect(200);

    const rowAfterUpdate = await dataSource.query(
      'SELECT subject FROM email_templates WHERE id = $1',
      [templateId],
    );
    expect(rowAfterUpdate[0].subject).toBe('Updated: {{invoiceNumber}}');

    await request(app.getHttpServer())
      .delete(`/api/v1/email-templates/${templateId}`)
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', 'delete-template-1')
      .expect(200);

    const rowAfterDelete = await dataSource.query(
      'SELECT id FROM email_templates WHERE id = $1',
      [templateId],
    );
    expect(rowAfterDelete).toHaveLength(0);
  });

  it('blocks deleting a default template with 409', async () => {
    const token = tokenFor(ownerId, Role.OWNER);

    const listResponse = await request(app.getHttpServer())
      .get('/api/v1/email-templates')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const defaultTemplate = listResponse.body.find(
      (t: { isDefault: boolean }) => t.isDefault,
    );

    await request(app.getHttpServer())
      .delete(`/api/v1/email-templates/${defaultTemplate.id}`)
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', 'delete-default-1')
      .expect(409);
  });

  it('rejects ACCOUNTANT role from creating an email template with 403', async () => {
    // JwtStrategy resolves the effective role from the real Membership row,
    // not from the JWT payload — a second, real ACCOUNTANT member is
    // required for the guard to actually see ACCOUNTANT.
    const accountantId = '00000000-0000-4000-8000-000000000900';
    const now = new Date();
    await dataSource.getRepository(UserOrmEntity).save({
      id: accountantId,
      name: 'Accountant User',
      email: 'accountant@test-org.vn',
      passwordHash: 'test-hash',
      emailVerifiedAt: now,
      createdAt: now,
    });
    await dataSource.getRepository(MembershipOrmEntity).save({
      organizationId,
      userId: accountantId,
      role: Role.ACCOUNTANT,
      invitedAt: now,
      joinedAt: now,
      createdAt: now,
    });

    const tokenAccountant = tokenFor(accountantId, Role.ACCOUNTANT);

    await request(app.getHttpServer())
      .post('/api/v1/email-templates')
      .set('Authorization', `Bearer ${tokenAccountant}`)
      .set('Idempotency-Key', 'create-template-accountant-1')
      .send({ name: 'xx', subject: 'x', bodyHtml: 'x' })
      .expect(403);
  });
});
