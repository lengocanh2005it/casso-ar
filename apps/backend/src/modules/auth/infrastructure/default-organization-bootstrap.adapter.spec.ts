import type { EntityManager } from 'typeorm';
import type { IEmailTemplateRepository } from '../../email-templates/application/email-template-repository.port';
import { DefaultOrganizationBootstrap } from './default-organization-bootstrap.adapter';

describe('DefaultOrganizationBootstrap', () => {
  it('seeds 4 default email templates for the organization', async () => {
    const saveMany = jest.fn().mockResolvedValue(undefined);
    const templateRepo: IEmailTemplateRepository = {
      findById: jest.fn(),
      findAllForOrganization: jest.fn(),
      save: jest.fn(),
      delete: jest.fn(),
      saveMany,
    };
    const manager = {} as EntityManager;
    const organizationId = 'org-1';

    const bootstrap = new DefaultOrganizationBootstrap(templateRepo);
    await bootstrap.seed(organizationId, manager);

    expect(saveMany).toHaveBeenCalledTimes(1);
    const [templates, calledManager] = saveMany.mock.calls[0];
    expect(calledManager).toBe(manager);
    expect(templates).toHaveLength(4);
    for (const template of templates) {
      expect(template.organizationId).toBe(organizationId);
      expect(template.isDefault).toBe(true);
    }
  });
});
