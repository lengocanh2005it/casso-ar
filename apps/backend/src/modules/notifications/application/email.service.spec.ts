import { ReceivableStatus } from '@casso-ar/shared-types';
import { Customer } from '../../customers/domain/customer';
import { CustomerGroup } from '../../customers/domain/customer-group';
import { EmailTemplate } from '../../email-templates/domain/email-template';
import { Organization } from '../../organizations/domain/organization';
import { Receivable } from '../../receivables/domain/receivable';
import { EmailService } from './email.service';

describe('EmailService', () => {
  it('renders a reminder from tenant-scoped data and enqueues it with retry settings', async () => {
    const receivable = new Receivable({
      id: 'rec-1',
      organizationId: 'org-1',
      customerId: 'cust-1',
      invoiceId: 'inv-1',
      originalAmount: 30_000_000,
      paidAmount: 10_000_000,
      dueDate: new Date('2026-08-01'),
      status: ReceivableStatus.PARTIALLY_PAID,
      salesRepresentativeId: 'user-1',
      createdAt: new Date('2026-07-01'),
      closedAt: null,
      version: 1,
    });
    const customer: Customer = {
      id: 'cust-1',
      organizationId: 'org-1',
      name: 'Company B',
      taxCode: '0312345678',
      email: 'ap@congtyb.vn',
      phone: '0900000000',
      defaultPaymentTermDays: 30,
      creditLimit: 0,
      priority: 1,
      customerGroup: CustomerGroup.REGULAR,
      createdAt: new Date('2026-01-01'),
    };
    const organization = new Organization({
      id: 'org-1',
      name: 'Casso Ledger',
      createdAt: new Date('2026-01-01'),
    });
    const template = new EmailTemplate({
      id: 'tpl-1',
      organizationId: 'org-1',
      name: 'Overdue reminder',
      subject: 'Invoice {{invoiceNumber}} — {{organizationName}}',
      bodyHtml: '<p>{{customerName}}, outstanding {{remainingAmount}}</p>',
      reminderStage: null,
      isDefault: false,
      createdAt: new Date('2026-01-01'),
      updatedAt: new Date('2026-01-01'),
      version: 1,
    });
    const queue = { add: jest.fn().mockResolvedValue(undefined) };
    const deps = {
      templateRepo: { findById: jest.fn().mockResolvedValue(template) },
      receivableRepo: { findById: jest.fn().mockResolvedValue(receivable) },
      customerRepo: { findById: jest.fn().mockResolvedValue(customer) },
      organizationRepo: { findById: jest.fn().mockResolvedValue(organization) },
      invoiceRepo: {
        findById: jest.fn().mockResolvedValue({ invoiceNumber: 'INV-1' }),
      },
      membershipRepo: {
        findOwnerByOrganization: jest
          .fn()
          .mockResolvedValue({ userId: 'owner-1' }),
      },
      userRepo: {
        findById: jest.fn().mockResolvedValue({ email: 'owner@congtyb.vn' }),
      },
      queue,
      tenantContext: { getOrganizationId: jest.fn().mockReturnValue('org-1') },
      renderUseCase: {
        render: jest.fn().mockReturnValue({
          subject: 'Invoice INV-1 — Casso Ledger',
          bodyHtml: '<p>Company B, outstanding 20000000</p>',
        }),
      },
    };

    const service = new EmailService(
      deps.templateRepo as any,
      { findAllByTemplateId: jest.fn().mockResolvedValue([]) } as any,
      deps.receivableRepo as any,
      deps.customerRepo as any,
      deps.organizationRepo as any,
      deps.invoiceRepo as any,
      deps.membershipRepo as any,
      deps.userRepo as any,
      queue as any,
      deps.tenantContext as any,
      deps.renderUseCase as any,
    );

    await service.sendReminderEmail({
      receivableId: 'rec-1',
      templateId: 'tpl-1',
      reminderExecutionId: 'exec-1',
    });

    expect(queue.add).toHaveBeenCalledWith(
      'send-reminder-email',
      expect.objectContaining({
        reminderExecutionId: 'exec-1',
        organizationId: 'org-1',
        to: 'ap@congtyb.vn',
        replyTo: 'owner@congtyb.vn',
        subject: 'Invoice INV-1 — Casso Ledger',
      }),
      {
        jobId: 'exec-1',
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
      },
    );
  });
});
