import { ReceivableStatus } from '@casso-ledger/shared-types';
import { ErrorCode } from '../../../../common/errors/error-code';
import type { Customer } from '../../../customers/domain/customer';
import { CustomerGroup } from '../../../customers/domain/customer-group';
import { Receivable } from '../../../receivables/domain/receivable';
import { DraftReminderEmailTool } from './draft-reminder-email.tool';

function buildReceivable(): Receivable {
  return new Receivable({
    id: 'rec-1',
    organizationId: 'org-1',
    customerId: 'cust-1',
    invoiceId: null,
    originalAmount: 50_000_000,
    paidAmount: 20_000_000,
    dueDate: new Date('2026-07-20'),
    status: ReceivableStatus.PARTIALLY_PAID,
    salesRepresentativeId: 'user-1',
    createdAt: new Date('2026-06-20'),
    closedAt: null,
    version: 1,
  });
}

function buildCustomer(): Customer {
  return {
    id: 'cust-1',
    organizationId: 'org-1',
    name: 'ABC Company',
    taxCode: '0101234567',
    email: 'ap@abc.vn',
    phone: '0900000000',
    defaultPaymentTermDays: 30,
    creditLimit: 100_000_000,
    priority: 1,
    customerGroup: CustomerGroup.REGULAR,
    createdAt: new Date('2026-01-01'),
  };
}

describe('DraftReminderEmailTool', () => {
  it('composes and persists a draft from receivable and customer data', async () => {
    const receivableRepo = {
      findById: jest.fn().mockResolvedValue(buildReceivable()),
    };
    const customerRepo = {
      findById: jest.fn().mockResolvedValue(buildCustomer()),
    };
    const draftRepo = { save: jest.fn() };
    const tool = new DraftReminderEmailTool(
      receivableRepo as any,
      customerRepo as any,
      draftRepo as any,
    );

    const result = await tool.execute(
      { receivableId: 'rec-1', tone: 'urgent' },
      'org-1',
    );

    expect(result.recipientEmail).toBe('ap@abc.vn');
    expect(result.subject).toContain('ABC Company');
    expect(result.bodyHtml).toContain('30.000.000');
    expect(draftRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        id: result.draftId,
        organizationId: 'org-1',
        receivableId: 'rec-1',
        recipientEmail: 'ap@abc.vn',
      }),
    );
  });

  it('throws RECEIVABLE_NOT_FOUND when the receivable is unavailable', async () => {
    const tool = new DraftReminderEmailTool(
      { findById: jest.fn().mockResolvedValue(null) } as any,
      { findById: jest.fn() } as any,
      { save: jest.fn() } as any,
    );

    await expect(
      tool.execute({ receivableId: 'missing' }, 'org-1'),
    ).rejects.toMatchObject({ errorCode: ErrorCode.RECEIVABLE_NOT_FOUND });
  });

  it('throws NOT_FOUND when the receivable customer is unavailable', async () => {
    const tool = new DraftReminderEmailTool(
      { findById: jest.fn().mockResolvedValue(buildReceivable()) } as any,
      { findById: jest.fn().mockResolvedValue(null) } as any,
      { save: jest.fn() } as any,
    );

    await expect(
      tool.execute({ receivableId: 'rec-1' }, 'org-1'),
    ).rejects.toMatchObject({ errorCode: ErrorCode.NOT_FOUND });
  });

  it('escapes HTML in customer.name inside the draft subject and body', async () => {
    const maliciousName = '<img src=x onerror=alert(1)> & "quoted"';
    const receivableRepo = {
      findById: jest.fn().mockResolvedValue(buildReceivable()),
    };
    const customerRepo = {
      findById: jest.fn().mockResolvedValue({
        ...buildCustomer(),
        name: maliciousName,
      }),
    };
    const draftRepo = { save: jest.fn() };
    const tool = new DraftReminderEmailTool(
      receivableRepo as any,
      customerRepo as any,
      draftRepo as any,
    );

    const result = await tool.execute({ receivableId: 'rec-1' }, 'org-1');

    expect(result.subject).not.toContain('<img');
    expect(result.subject).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(result.bodyHtml).not.toContain('<img src=x onerror=');
    expect(result.bodyHtml).toContain(
      'Kính gửi &lt;img src=x onerror=alert(1)&gt; &amp; &quot;quoted&quot;,',
    );
  });
});
