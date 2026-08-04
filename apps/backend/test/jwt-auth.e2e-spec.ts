import {
  Controller,
  Get,
  type INestApplication,
  UseGuards,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { JwtAuthGuard } from '../src/common/auth/jwt-auth.guard';

@Controller('_test-protected')
class TestProtectedController {
  @Get()
  @UseGuards(JwtAuthGuard)
  ping() {
    return { ok: true };
  }
}

describe('JwtAuthGuard (e2e)', () => {
  let app: INestApplication;
  let jwtService: JwtService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
      controllers: [TestProtectedController],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    jwtService = moduleRef.get(JwtService);
  });

  afterAll(async () => {
    await app.close();
  });

  it('rejects requests with no Authorization header', () => {
    return request(app.getHttpServer()).get('/_test-protected').expect(401);
  });

  it('accepts requests with a valid signed JWT', async () => {
    const token = jwtService.sign({
      userId: 'user-1',
      organizationId: 'org-1',
      role: 'OWNER',
    });

    return request(app.getHttpServer())
      .get('/_test-protected')
      .set('Authorization', `Bearer ${token}`)
      .expect(200, { ok: true });
  });
});
