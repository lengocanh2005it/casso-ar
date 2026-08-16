import {
  Controller,
  Get,
  type INestApplication,
  UseGuards,
} from '@nestjs/common';
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
import { JwtAuthGuard } from '../src/common/auth/jwt-auth.guard';
import { configureApp } from '../src/configure-app';
import { Role } from '../src/modules/organizations/domain/membership';
import { MembershipOrmEntity } from '../src/modules/organizations/infrastructure/membership.orm-entity';
import { UserOrmEntity } from '../src/modules/users/infrastructure/user.orm-entity';

@Controller('_test-protected')
class TestProtectedController {
  @Get()
  @UseGuards(JwtAuthGuard)
  ping() {
    return { ok: true };
  }
}

describe('JwtAuthGuard (e2e)', () => {
  let container: StartedPostgreSqlContainer;
  let app: INestApplication;
  let jwtService: JwtService;

  const organizationId = '00000000-0000-0000-0000-0000000000f1';
  const userId = '00000000-0000-0000-0000-0000000000f2';

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
      controllers: [TestProtectedController],
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
    jwtService = moduleRef.get(JwtService);

    // The valid-JWT test needs an active membership row — JwtStrategy.validate()
    // looks up (userId, organizationId) in the DB and derives the effective role
    // from it, ignoring the `role` claim in the JWT payload.
    const dataSource = moduleRef.get(DataSource);
    await dataSource.getRepository(UserOrmEntity).save({
      id: userId,
      name: 'Test User',
      email: 'jwt-test@example.com',
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
  }, 60_000);

  afterAll(async () => {
    await app.close();
    await container.stop();
  });

  it('rejects requests with no Authorization header', () => {
    return request(app.getHttpServer())
      .get('/api/v1/_test-protected')
      .expect(401);
  });

  it('rejects an access token passed via ?token= query string (CWE-598 regression guard — the SSE client sends the Bearer header)', async () => {
    const token = jwtService.sign({
      userId,
      organizationId,
      role: 'OWNER',
    });

    return request(app.getHttpServer())
      .get(`/api/v1/_test-protected?token=${token}`)
      .expect(401);
  });

  it('accepts requests with a valid signed JWT', async () => {
    const token = jwtService.sign({
      userId,
      organizationId,
      role: 'OWNER',
    });

    return request(app.getHttpServer())
      .get('/api/v1/_test-protected')
      .set('Authorization', `Bearer ${token}`)
      .expect(200, { ok: true });
  });
});
