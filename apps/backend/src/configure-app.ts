import { type INestApplication, ValidationPipe } from '@nestjs/common';

/**
 * Global app setup (prefix + validation pipe) shared between the real
 * bootstrap (main.ts) and e2e/integration tests, so the two can't drift.
 */
export function configureApp(app: INestApplication): void {
  app.setGlobalPrefix('api/v1', { exclude: ['health', 'metrics'] });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
}
