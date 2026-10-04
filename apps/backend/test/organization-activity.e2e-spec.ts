import type { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';
import request from 'supertest';
import type { StartedTestContainer } from 'testcontainers';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/configure-app';
import { CollectionActivityType } from '../src/modules/collection-activity/common/collection-activity-types';
import { CollectionActivityOrmEntity } from '../src/modules/collection-activity/infrastructure/collection-activity.orm-entity';
import { Role } from '../src/modules/organizations/domain/membership';
import { MembershipOrmEntity } from '../src/modules/organizations/infrastructure/membership.orm-entity';
import { UserOrmEntity } from '../src/modules/users/infrastructure/user.orm-entity';
import { startTestRedis } from './helpers/test-redis';

describe('Organization Activity (e2e)', () => {
  let container: StartedPostgreSqlContainer;
  let redis: StartedTestContainer;
  let app: INestApplication;
  let dataSource: DataSource;
  let jwtService: JwtService;

  beforeAll(async () => {
    redis = await startTestRedis();
    container = await new PostgreSqlContainer('postgres:16').start();
    process.env.DB_HOST = container.getHost();
    process.env.DB_PORT = String(container.getMappedPort(5432));
    process.env.DB_USERNAME = container.getUsername();
    process.env.DB_PASSWORD = container.getPassword();
    process.env.DB_DATABASE = container.getDatabase();
    process.env.JWT_SECRET = 'organization-activity-e2e-secret';
    process.env.ACCESS_TOKEN_ENCRYPTION_KEY =
      '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    process.env.RESEND_API_KEY = 'e2e-resend-key';
    process.env.CASSO_WEBHOOK_CLIENT_ID = 'e2e-client';
    process.env.CASSO_WEBHOOK_SECRET_KEY = 'e2e-secret';

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
    await app.close();
    await Promise.all([redis.stop(), container.stop()]);
  }, 60_000);

  async function setUpOrg(organizationId: string, role: Role) {
    const userId = organizationId.replace('00000000-0000', '22222222-2222');
    await dataSource.getRepository(UserOrmEntity).save({
      id: userId,
      name: 'Organization Activity Test User',
      email: `organization-activity-${organizationId}@example.com`,
      passwordHash: 'test-hash',
      emailVerifiedAt: new Date(),
      createdAt: new Date(),
    });
    await dataSource.getRepository(MembershipOrmEntity).save({
      id: organizationId.replace('00000000-0000', '11111111-1111'),
      organizationId,
      userId,
      role,
      invitedAt: new Date(),
      joinedAt: new Date(),
      createdAt: new Date(),
    });
    const token = jwtService.sign({ userId, organizationId, role });
    return { token };
  }

  it("GET /api/v1/activity returns only this organization's activities, newest first", async () => {
    const organizationId = '00000000-0000-4000-8000-000000000701';
    const { token } = await setUpOrg(organizationId, Role.OWNER);
    const otherOrgId = '00000000-0000-4000-8000-000000000702';
    await setUpOrg(otherOrgId, Role.OWNER);

    await dataSource.getRepository(CollectionActivityOrmEntity).save([
      {
        id: '00000000-0000-4000-8000-000000000801',
        organizationId,
        receivableId: 'rec-1',
        customerId: 'cust-1',
        activityType: CollectionActivityType.PAYMENT_RECEIVED,
        description: 'older',
        metadata: {},
        createdByUserId: null,
        createdAt: new Date('2026-08-01T00:00:00Z'),
      },
      {
        id: '00000000-0000-4000-8000-000000000802',
        organizationId,
        receivableId: 'rec-1',
        customerId: 'cust-1',
        activityType: CollectionActivityType.EMAIL_SENT,
        description: 'newer',
        metadata: {},
        createdByUserId: null,
        createdAt: new Date('2026-08-02T00:00:00Z'),
      },
      {
        id: '00000000-0000-4000-8000-000000000803',
        organizationId: otherOrgId,
        receivableId: 'rec-9',
        customerId: 'cust-9',
        activityType: CollectionActivityType.PAYMENT_RECEIVED,
        description: 'other org',
        metadata: {},
        createdByUserId: null,
        createdAt: new Date('2026-08-03T00:00:00Z'),
      },
    ]);

    const res = await request(app.getHttpServer())
      .get('/api/v1/activity')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body.total).toBe(2);
    expect(res.body.items.map((i: { id: string }) => i.id)).toEqual([
      '00000000-0000-4000-8000-000000000802',
      '00000000-0000-4000-8000-000000000801',
    ]);
  });
});
