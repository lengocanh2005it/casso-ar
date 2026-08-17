import type { INestApplication } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { configureApp } from './configure-app';

describe('configureApp', () => {
  it('enables credentialed CORS for the configured frontend origin', () => {
    const app = {
      enableCors: jest.fn(),
      setGlobalPrefix: jest.fn(),
      useGlobalPipes: jest.fn(),
      useGlobalFilters: jest.fn(),
      get: jest.fn().mockReturnValue({}),
    } as unknown as INestApplication;
    const config = {
      get: jest.fn().mockReturnValue('http://localhost:5173'),
    } as unknown as ConfigService;

    configureApp(app, config);

    expect(app.enableCors).toHaveBeenCalledWith({
      origin: 'http://localhost:5173',
      credentials: true,
    });
  });
});
