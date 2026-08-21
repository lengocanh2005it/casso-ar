import type { EntityManager } from 'typeorm';
import type { IEmailTemplateRepository } from '../../email-templates/application/email-template-repository.port';
import type { IReminderPolicyRepository } from '../../reminders/application/reminder-policy-repository.port';
import type { IReminderRuleRepository } from '../../reminders/application/reminder-rule-repository.port';
import { DefaultOrganizationBootstrap } from './default-organization-bootstrap.adapter';

describe('DefaultOrganizationBootstrap', () => {
  it('seeds 4 default email templates for the organization', async () => {
    const saveMany = jest.fn().mockResolvedValue(undefined);
    const templateRepo: IEmailTemplateRepository = {
      findById: jest.fn(),
      findByIdForUpdate: jest.fn(),
      findAllForOrganization: jest.fn(),
      save: jest.fn(),
      delete: jest.fn(),
      saveMany,
    };
    const policyRepo = {
      save: jest.fn().mockResolvedValue(undefined),
    } as unknown as IReminderPolicyRepository;
    const ruleRepo = {
      replaceForPolicy: jest.fn().mockResolvedValue(undefined),
    } as unknown as IReminderRuleRepository;
    const manager = {} as EntityManager;
    const organizationId = 'org-1';

    const bootstrap = new DefaultOrganizationBootstrap(
      templateRepo,
      policyRepo,
      ruleRepo,
    );
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

  it('seeds every reminder rule with a real emailTemplateId matching a seeded template', async () => {
    const saveMany = jest.fn().mockResolvedValue(undefined);
    const templateRepo: IEmailTemplateRepository = {
      findById: jest.fn(),
      findByIdForUpdate: jest.fn(),
      findAllForOrganization: jest.fn(),
      save: jest.fn(),
      delete: jest.fn(),
      saveMany,
    };
    const policyRepo = {
      save: jest.fn().mockResolvedValue(undefined),
    } as unknown as IReminderPolicyRepository;
    const ruleRepo = {
      replaceForPolicy: jest.fn().mockResolvedValue(undefined),
    } as unknown as IReminderRuleRepository;
    const manager = {} as EntityManager;
    const organizationId = 'org-1';

    const bootstrap = new DefaultOrganizationBootstrap(
      templateRepo,
      policyRepo,
      ruleRepo,
    );
    await bootstrap.seed(organizationId, manager);

    const [templates] = saveMany.mock.calls[0];
    const templateIds = new Set(templates.map((t: { id: string }) => t.id));

    const replaceForPolicyCalls = (ruleRepo.replaceForPolicy as jest.Mock).mock
      .calls;
    expect(replaceForPolicyCalls).toHaveLength(2);
    for (const [, rules] of replaceForPolicyCalls) {
      expect(rules).toHaveLength(4);
      for (const rule of rules) {
        expect(rule.emailTemplateId).toBeTruthy();
        expect(templateIds.has(rule.emailTemplateId)).toBe(true);
      }
    }
  });
});
