import { GUARDS_METADATA } from '@nestjs/common/constants';
import { SmtpConfigController } from './smtp-config.controller';
import { SmtpConfigRateLimitGuard } from './smtp-config-rate-limit.guard';

describe('SmtpConfigController', () => {
  it('rate-limits SMTP test-and-save requests', () => {
    expect(
      Reflect.getMetadata(GUARDS_METADATA, SmtpConfigController.prototype.save),
    ).toContain(SmtpConfigRateLimitGuard);
  });
});
