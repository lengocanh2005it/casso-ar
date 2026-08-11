import {
  OrganizationSmtpConfig,
  SmtpConfigStatus,
} from './organization-smtp-config';

function buildConfig(
  overrides: Partial<{ status: SmtpConfigStatus; version: number }> = {},
) {
  return new OrganizationSmtpConfig({
    id: 'smtp-1',
    organizationId: 'org-1',
    host: 'smtp.congtyb.vn',
    port: 587,
    username: 'noreply@congtyb.vn',
    encryptedPassword: 'ciphertext',
    fromAddress: 'noreply@congtyb.vn',
    status: overrides.status ?? SmtpConfigStatus.CONNECTED,
    createdAt: new Date('2026-08-01'),
    updatedAt: new Date('2026-08-01'),
    version: overrides.version ?? 1,
  });
}

describe('OrganizationSmtpConfig', () => {
  it('markFailed() transitions CONNECTED to FAILED', () => {
    const config = buildConfig({ status: SmtpConfigStatus.CONNECTED });
    const failed = config.markFailed();
    expect(failed.status).toBe(SmtpConfigStatus.FAILED);
  });

  it('markFailed() is a no-op (same status) when already FAILED', () => {
    const config = buildConfig({ status: SmtpConfigStatus.FAILED });
    const failed = config.markFailed();
    expect(failed.status).toBe(SmtpConfigStatus.FAILED);
  });

  it('isConnected() reflects the current status', () => {
    expect(
      buildConfig({ status: SmtpConfigStatus.CONNECTED }).isConnected(),
    ).toBe(true);
    expect(buildConfig({ status: SmtpConfigStatus.FAILED }).isConnected()).toBe(
      false,
    );
  });
});
