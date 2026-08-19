import { Logger } from '@nestjs/common';
import type { ICasIdIntegrationAdapter } from '../application/cas-id-integration-adapter.port';
import { CasIdAdapter } from './cas-id.adapter';
import { MockCasIdAdapter } from './mock-cas-id.adapter';

const logger = new Logger('CasIdAdapterFactory');

export function selectCasIdAdapter(
  env: NodeJS.ProcessEnv = process.env,
): ICasIdIntegrationAdapter {
  const hasClientId = Boolean(env.CAS_ID_CLIENT_ID);
  const hasSecretKey = Boolean(env.CAS_ID_CLIENT_SECRET);
  if (hasClientId && hasSecretKey) {
    return new CasIdAdapter();
  }
  if (hasClientId !== hasSecretKey) {
    logger.warn(
      'Cas ID credentials incomplete (CAS_ID_CLIENT_ID/CAS_ID_CLIENT_SECRET) — using MockCasIdAdapter',
    );
  }
  return new MockCasIdAdapter();
}
