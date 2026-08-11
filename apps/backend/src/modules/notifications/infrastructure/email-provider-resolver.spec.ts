import { SmtpConfigStatus } from '../../smtp-config/domain/organization-smtp-config';
import { EmailProviderResolver } from './email-provider-resolver';
import { SmtpEmailAdapter } from './smtp-email.adapter';

describe('EmailProviderResolver', () => {
  function buildDeps() {
    return {
      resendAdapter: { send: jest.fn() },
      smtpConfigRepo: { findByOrganizationId: jest.fn() },
      encryptionKey: 'a'.repeat(64),
    };
  }

  it('returns the Resend adapter when forceProvider is RESEND without consulting SMTP config', async () => {
    const deps = buildDeps();
    const resolver = new EmailProviderResolver(
      deps.resendAdapter as any,
      deps.smtpConfigRepo as any,
      deps.encryptionKey,
    );

    const adapter = await resolver.resolve('org-1', 'RESEND');

    expect(adapter).toBe(deps.resendAdapter);
    expect(deps.smtpConfigRepo.findByOrganizationId).not.toHaveBeenCalled();
  });

  it('returns a SmtpEmailAdapter when the org has a CONNECTED config', async () => {
    const deps = buildDeps();
    deps.smtpConfigRepo.findByOrganizationId.mockResolvedValue({
      status: SmtpConfigStatus.CONNECTED,
      organizationId: 'org-1',
      isConnected: () => true,
    });
    const resolver = new EmailProviderResolver(
      deps.resendAdapter as any,
      deps.smtpConfigRepo as any,
      deps.encryptionKey,
    );

    const adapter = await resolver.resolve('org-1');

    expect(adapter).toBeInstanceOf(SmtpEmailAdapter);
  });

  it('falls back to the Resend adapter when the org config is FAILED', async () => {
    const deps = buildDeps();
    deps.smtpConfigRepo.findByOrganizationId.mockResolvedValue({
      status: SmtpConfigStatus.FAILED,
      isConnected: () => false,
    });
    const resolver = new EmailProviderResolver(
      deps.resendAdapter as any,
      deps.smtpConfigRepo as any,
      deps.encryptionKey,
    );

    expect(await resolver.resolve('org-1')).toBe(deps.resendAdapter);
  });

  it('falls back to the Resend adapter when the org has no config', async () => {
    const deps = buildDeps();
    deps.smtpConfigRepo.findByOrganizationId.mockResolvedValue(null);
    const resolver = new EmailProviderResolver(
      deps.resendAdapter as any,
      deps.smtpConfigRepo as any,
      deps.encryptionKey,
    );

    expect(await resolver.resolve('org-1')).toBe(deps.resendAdapter);
  });
});
