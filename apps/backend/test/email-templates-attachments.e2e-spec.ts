import type { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
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
import { EMAIL_PROVIDER_ADAPTER } from '../src/modules/notifications/application/email-provider-adapter.port';
import { Role } from '../src/modules/organizations/domain/membership';
import { TAX_CODE_LOOKUP_ADAPTER } from '../src/modules/tax-verification/application/tax-code-lookup.port';
import { UserOrmEntity } from '../src/modules/users/infrastructure/user.orm-entity';

const fakeEmailProvider = {
  send: jest.fn().mockResolvedValue({ providerMessageId: 'fake-msg-id' }),
};

jest.setTimeout(60_000);

describe('Email template attachments (e2e)', () => {
  let container: StartedPostgreSqlContainer;
  let app: INestApplication;
  let dataSource: DataSource;
  let jwtService: JwtService;
  let organizationId: string;
  let ownerId: string;

  function tokenFor(userId: string, role: string): string {
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

    // Seed org + user via signup
    const signupResponse = await request(app.getHttpServer())
      .post('/api/v1/auth/signup')
      .send({
        organizationName: 'Attachment Test Co',
        name: 'Owner',
        email: 'owner@attach-test.vn',
        password: 'S3curePass!',
        taxCode: '0123456789',
      })
      .expect(201);

    organizationId = signupResponse.body.organizationId;
    ownerId = signupResponse.body.userId;

    await dataSource
      .getRepository(UserOrmEntity)
      .update({ id: ownerId }, { emailVerifiedAt: new Date() });
  }, 60_000);

  afterAll(async () => {
    await app?.close();
    await container?.stop();
  });

  it('uploads a PDF attachment, lists it, and deletes it', async () => {
    const token = tokenFor(ownerId, Role.OWNER);

    const createRes = await request(app.getHttpServer())
      .post('/api/v1/email-templates')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'With attachment',
        subject: 'Hi {{customerName}}',
        bodyHtml: '<p>{{customerName}}</p>',
      })
      .expect(201);
    const templateId = createRes.body.id as string;

    const uploadRes = await request(app.getHttpServer())
      .post(`/api/v1/email-templates/${templateId}/attachments`)
      .set('Authorization', `Bearer ${token}`)
      .attach('file', Buffer.from('%PDF-1.4 fake'), {
        filename: 'invoice.pdf',
        contentType: 'application/pdf',
      })
      .expect(201);

    expect(uploadRes.body.filename).toBe('invoice.pdf');
    expect(uploadRes.body.mimeType).toBe('application/pdf');
    expect(uploadRes.body.storageKey).toBeUndefined();

    await request(app.getHttpServer())
      .delete(
        `/api/v1/email-templates/${templateId}/attachments/${uploadRes.body.id}`,
      )
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
  });

  it('rejects a disallowed MIME type with VALIDATION_ERROR', async () => {
    const token = tokenFor(ownerId, Role.OWNER);

    const createRes = await request(app.getHttpServer())
      .post('/api/v1/email-templates')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Bad type',
        subject: 'Hi',
        bodyHtml: '<p>hi</p>',
      })
      .expect(201);
    const templateId = createRes.body.id as string;

    const res = await request(app.getHttpServer())
      .post(`/api/v1/email-templates/${templateId}/attachments`)
      .set('Authorization', `Bearer ${token}`)
      .attach('file', Buffer.from('not a real docx'), {
        filename: 'resume.docx',
        contentType:
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      })
      .expect(400);

    expect(res.body.errorCode).toBe('VALIDATION_ERROR');
  });

  it('rejects an upload from a different organization (tenant isolation)', async () => {
    const tokenA = tokenFor(ownerId, Role.OWNER);

    // Create a second org via signup
    const signupB = await request(app.getHttpServer())
      .post('/api/v1/auth/signup')
      .send({
        organizationName: 'Org B',
        name: 'Owner B',
        email: 'owner-b@attach-test.vn',
        password: 'S3curePass!',
        taxCode: '0123456780',
      })
      .expect(201);

    const orgBId = signupB.body.organizationId;
    const ownerBId = signupB.body.userId;
    await dataSource
      .getRepository(UserOrmEntity)
      .update({ id: ownerBId }, { emailVerifiedAt: new Date() });
    const tokenB = jwtService.sign({
      userId: ownerBId,
      organizationId: orgBId,
      role: Role.OWNER,
    });

    // Create template under org A
    const createRes = await request(app.getHttpServer())
      .post('/api/v1/email-templates')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ name: 'Org A template', subject: 'Hi', bodyHtml: '<p>hi</p>' })
      .expect(201);
    const templateId = createRes.body.id as string;

    // Try to upload as org B — should get 404 (template not found for org B)
    const res = await request(app.getHttpServer())
      .post(`/api/v1/email-templates/${templateId}/attachments`)
      .set('Authorization', `Bearer ${tokenB}`)
      .attach('file', Buffer.from('%PDF-1.4 fake'), {
        filename: 'invoice.pdf',
        contentType: 'application/pdf',
      })
      .expect(404);

    expect(res.body.errorCode).toBe('NOT_FOUND');
  });
});
