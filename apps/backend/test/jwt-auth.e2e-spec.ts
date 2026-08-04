import {
  Controller,
  Get,
  type INestApplication,
  UseGuards,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
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

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
      controllers: [TestProtectedController],
    }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    jwtService = moduleRef.get(JwtService);

    // The valid-JWT test needs an active membership row — JwtStrategy.validate()
    // looks up (userId, organizationId) in the DB and derives the effective role
    // from it, ignoring the `role` claim in the JWT payload.
    const dataSource = moduleRef.get(DataSource);
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
