import type { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/configure-app';
import { CustomerGroup } from '../src/modules/customers/domain/customer-group';
import { CustomerOrmEntity } from '../src/modules/customers/infrastructure/customer.orm-entity';
import { Role } from '../src/modules/organizations/domain/membership';
import { MembershipOrmEntity } from '../src/modules/organizations/infrastructure/membership.orm-entity';
import { ReminderSchedulerService } from '../src/modules/reminders/application/reminder-scheduler.service';
import { ReminderPolicyOrmEntity } from '../src/modules/reminders/infrastructure/reminder-policy.orm-entity';
import { ReminderRuleOrmEntity } from '../src/modules/reminders/infrastructure/reminder-rule.orm-entity';
import { UserOrmEntity } from '../src/modules/users/infrastructure/user.orm-entity';

describe('Reminder automation (integration)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let jwtService: JwtService;

  beforeAll(async () => {
    process.env.REDIS_HOST = 'localhost';
    process.env.REDIS_PORT = '6379';
    process.env.JWT_SECRET = 'e2e-jwt-secret';
    process.env.ACCESS_TOKEN_ENCRYPTION_KEY =
      '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    process.env.RESEND_API_KEY = 'e2e-resend-key';
    process.env.CASSO_WEBHOOK_CLIENT_ID = 'e2e-client';
    process.env.CASSO_WEBHOOK_SECRET_KEY = 'e2e-secret';
    process.env.DB_HOST = 'localhost';
    process.env.DB_PORT = '5432';
    process.env.DB_USERNAME = 'postgres';
    process.env.DB_PASSWORD = 'casso';
    process.env.DB_DATABASE = 'casso_ledger';

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    dataSource = moduleRef.get(DataSource);
    jwtService = moduleRef.get(JwtService);
  }, 60_000);

  afterAll(async () => {
    await app?.close();
  });

  async function setUpOrg(organizationId: string) {
    const userId = '00000000-0000-4000-8000-000000000100';
    const customerId = '00000000-0000-4000-8000-000000000101';

    await dataSource.getRepository(UserOrmEntity).save({
      id: userId,
      name: 'Test User',
      email: `reminder-test-${organizationId.slice(-4)}@example.com`,
      passwordHash: 'test-hash',
      emailVerifiedAt: new Date(),
      createdAt: new Date(),
    });

    await dataSource.getRepository(MembershipOrmEntity).save({
      organizationId,
      userId,
      role: Role.OWNER,
      invitedAt: new Date(),
      joinedAt: new Date(),
      createdAt: new Date(),
    });

    await dataSource.getRepository(CustomerOrmEntity).save({
      id: customerId,
      organizationId,
      name: 'Công ty C',
      taxCode: '0398765432',
      email: 'ap@congtyc.vn',
      phone: '0911111111',
      defaultPaymentTermDays: 30,
      creditLimit: 100_000_000,
      priority: 1,
      customerGroup: CustomerGroup.VIP,
      createdAt: new Date(),
    });

    const token = jwtService.sign({ userId, organizationId, role: Role.OWNER });
    return { customerId, token };
  }

  it('GET /reminder-executions returns paginated results', async () => {
    const organizationId = '00000000-0000-4000-8000-000000000400';
    const { token } = await setUpOrg(organizationId);

    const res = await request(app.getHttpServer())
      .get('/api/v1/reminder-executions')
      .set('Authorization', `Bearer ${token}`)
      .query({ page: 1, limit: 10 })
      .expect(200);

    expect(res.body).toHaveProperty('items');
    expect(res.body).toHaveProperty('total');
    expect(Array.isArray(res.body.items)).toBe(true);
  });

  it('GET /reminder-policies lists policies for the organization', async () => {
    const organizationId = '00000000-0000-4000-8000-000000000500';
    const { token } = await setUpOrg(organizationId);

    const res = await request(app.getHttpServer())
      .get('/api/v1/reminder-policies')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(Array.isArray(res.body)).toBe(true);
  });

  it('POST /reminder-policies creates a policy with rules', async () => {
    const organizationId = '00000000-0000-4000-8000-000000000600';
    const { token } = await setUpOrg(organizationId);

    const res = await request(app.getHttpServer())
      .post('/api/v1/reminder-policies')
      .set('Authorization', `Bearer ${token}`)
      .send({
        customerGroup: 'VIP',
        isActive: true,
        rules: [
          {
            offsetDays: -3,
            emailTemplateId: 'fake-template',
            minIntervalDays: 7,
          },
        ],
      })
      .expect(201);

    expect(res.body.customerGroup).toBe('VIP');
  });

  it('scheduler scans and does not throw for empty data', async () => {
    const scheduler = app.get(ReminderSchedulerService);
    await scheduler.scan(new Date('2026-08-03'));
  });
});
