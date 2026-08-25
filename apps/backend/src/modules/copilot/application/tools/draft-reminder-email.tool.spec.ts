import { ReceivableStatus } from '@casso-ar/shared-types';
import { ErrorCode } from '../../../../common/errors/error-code';
import type { Customer } from '../../../customers/domain/customer';
import { CustomerGroup } from '../../../customers/domain/customer-group';
import { Receivable } from '../../../receivables/domain/receivable';
import { DraftReminderEmailTool } from './draft-reminder-email.tool';

function buildReceivable(
  overrides: Partial<ConstructorParameters<typeof Receivable>[0]> = {},
): Receivable {
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
    ...overrides,
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

function buildTool(overrides: {
  receivable?: Receivable | null;
  customer?: Customer | null;
  save?: jest.Mock;
}) {
  const receivableRepo = {
    findById: jest
      .fn()
      .mockResolvedValue(
        overrides.receivable === undefined
          ? buildReceivable()
          : overrides.receivable,
      ),
  };
  const customerRepo = {
    findById: jest
      .fn()
      .mockResolvedValue(
        overrides.customer === undefined ? buildCustomer() : overrides.customer,
      ),
  };
  const draftRepo = { save: overrides.save ?? jest.fn() };
  return {
    tool: new DraftReminderEmailTool(
      receivableRepo as any,
      customerRepo as any,
      draftRepo as any,
    ),
    receivableRepo,
    customerRepo,
    draftRepo,
  };
}

describe('DraftReminderEmailTool', () => {
  it('persists the model-authored subject/bodyHtml with a tool-derived recipientEmail', async () => {
    const { tool, draftRepo } = buildTool({});

    const result = await tool.execute(
      {
        receivableId: 'rec-1',
        subject: 'Nhắc thanh toán khoản phải thu',
        bodyHtml: '<p>Kính gửi ABC Company, còn lại 30.000.000 VND.</p>',
      },
      'org-1',
      'user-1',
    );

    expect(result.recipientEmail).toBe('ap@abc.vn');
    expect(result.subject).toBe('Nhắc thanh toán khoản phải thu');
    expect(result.bodyHtml).toBe(
      '<p>Kính gửi ABC Company, còn lại 30.000.000 VND.</p>',
    );
    expect(draftRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        id: result.draftId,
        organizationId: 'org-1',
        userId: 'user-1',
        receivableId: 'rec-1',
        recipientEmail: 'ap@abc.vn',
        subject: 'Nhắc thanh toán khoản phải thu',
      }),
    );
  });

  it('sanitizes bodyHtml before persisting and returning it', async () => {
    const { tool } = buildTool({});

    const result = await tool.execute(
      {
        receivableId: 'rec-1',
        subject: 'Nhắc thanh toán',
        bodyHtml: '<p>Hello</p><script>alert(1)</script>',
      },
      'org-1',
      'user-1',
    );

    expect(result.bodyHtml).not.toContain('<script');
    expect(result.bodyHtml).toContain('<p>Hello</p>');
  });

  it('throws VALIDATION_ERROR when subject is missing', async () => {
    const { tool } = buildTool({});

    await expect(
      tool.execute(
        { receivableId: 'rec-1', subject: '', bodyHtml: '<p>ok</p>' } as any,
        'org-1',
        'user-1',
      ),
    ).rejects.toMatchObject({ errorCode: ErrorCode.VALIDATION_ERROR });
  });

  it('throws VALIDATION_ERROR when bodyHtml is missing', async () => {
    const { tool } = buildTool({});

    await expect(
      tool.execute(
        { receivableId: 'rec-1', subject: 'Subject', bodyHtml: '' } as any,
        'org-1',
        'user-1',
      ),
    ).rejects.toMatchObject({ errorCode: ErrorCode.VALIDATION_ERROR });
  });

  it('throws VALIDATION_ERROR when subject exceeds 200 characters', async () => {
    const { tool } = buildTool({});

    await expect(
      tool.execute(
        {
          receivableId: 'rec-1',
          subject: 'x'.repeat(201),
          bodyHtml: '<p>ok</p>',
        },
        'org-1',
        'user-1',
      ),
    ).rejects.toMatchObject({ errorCode: ErrorCode.VALIDATION_ERROR });
  });

  it('throws VALIDATION_ERROR when bodyHtml exceeds 20000 characters', async () => {
    const { tool } = buildTool({});

    await expect(
      tool.execute(
        {
          receivableId: 'rec-1',
          subject: 'Subject',
          bodyHtml: `<p>${'x'.repeat(20_000)}</p>`,
        },
        'org-1',
        'user-1',
      ),
    ).rejects.toMatchObject({ errorCode: ErrorCode.VALIDATION_ERROR });
  });

  it('throws RECEIVABLE_NOT_FOUND when the receivable is unavailable', async () => {
    const { tool } = buildTool({ receivable: null });

    await expect(
      tool.execute(
        { receivableId: 'missing', subject: 'Subject', bodyHtml: '<p>ok</p>' },
        'org-1',
        'user-1',
      ),
    ).rejects.toMatchObject({ errorCode: ErrorCode.RECEIVABLE_NOT_FOUND });
  });

  it('throws TENANT_MISMATCH when the receivable belongs to another organization', async () => {
    const otherOrgReceivable = buildReceivable({ organizationId: 'org-2' });
    const { tool } = buildTool({ receivable: otherOrgReceivable });

    await expect(
      tool.execute(
        { receivableId: 'rec-1', subject: 'Subject', bodyHtml: '<p>ok</p>' },
        'org-1',
        'user-1',
      ),
    ).rejects.toMatchObject({ errorCode: ErrorCode.TENANT_MISMATCH });
  });

  it('throws NOT_FOUND when the receivable customer is unavailable', async () => {
    const { tool } = buildTool({ customer: null });

    await expect(
      tool.execute(
        { receivableId: 'rec-1', subject: 'Subject', bodyHtml: '<p>ok</p>' },
        'org-1',
        'user-1',
      ),
    ).rejects.toMatchObject({ errorCode: ErrorCode.NOT_FOUND });
  });
});
