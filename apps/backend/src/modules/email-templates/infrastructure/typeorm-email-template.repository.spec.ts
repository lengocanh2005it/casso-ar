import { TenantContextService } from '../../../common/tenancy/tenant-context';
import { Role } from '../../organizations/domain/membership';
import { EmailTemplate } from '../domain/email-template';
import { TypeOrmEmailTemplateRepository } from './typeorm-email-template.repository';

const PROPS = {
  id: 'tpl-1',
  organizationId: 'org-1',
  name: 'Overdue reminder',
  subject: 'Your invoice is overdue',
  bodyHtml: '<p>Please pay</p>',
  reminderStage: 'STAGE_1',
  isDefault: false,
  createdAt: new Date('2026-07-01'),
  updatedAt: new Date('2026-07-01'),
  version: 1,
};

describe('TypeOrmEmailTemplateRepository', () => {
  it('maps a domain EmailTemplate to a plain ORM entity', async () => {
    const ormRepo = { save: jest.fn().mockResolvedValue(undefined) };
    const tenantContext = new TenantContextService();
    const repo = new TypeOrmEmailTemplateRepository(
      ormRepo as any,
      tenantContext,
    );
    const template = new EmailTemplate(PROPS);

    await tenantContext.run(
      { userId: 'u1', organizationId: 'org-1', role: Role.OWNER },
      () => repo.save(template),
    );

    expect(ormRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'tpl-1',
        organizationId: 'org-1',
        name: 'Overdue reminder',
        subject: 'Your invoice is overdue',
      }),
    );
    const saved = ormRepo.save.mock.calls[0][0];
    expect(saved).toEqual(PROPS);
    expect(saved).not.toBeInstanceOf(EmailTemplate);
  });
});
