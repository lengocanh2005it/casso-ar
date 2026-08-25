import { BankConnectionStatusListener } from './bank-connection-status.listener';

const OWNER = { userId: 'owner-1', email: 'owner@company.vn' };

function buildListener(
  ownerMembership: { userId: string } | null,
  owner: { email?: string } | null,
  emailQueue = { add: jest.fn() },
) {
  const membershipRepo = {
    findOwnerByOrganization: jest.fn().mockResolvedValue(ownerMembership),
  };
  const userRepo = { findById: jest.fn().mockResolvedValue(owner) };
  const tenantContext = {
    run: jest.fn(
      async (
        _user: object,
        callback: () => Promise<unknown>,
      ): Promise<unknown> => callback(),
    ),
  };
  const listener = new BankConnectionStatusListener(
    membershipRepo as never,
    userRepo as never,
    emailQueue as never,
    tenantContext as never,
  );
  return { listener, membershipRepo, userRepo, emailQueue, tenantContext };
}

describe('BankConnectionStatusListener', () => {
  it('enqueues a reauthorization alert to the org owner', async () => {
    const { listener, emailQueue, tenantContext } = buildListener(
      { userId: OWNER.userId },
      OWNER,
    );

    await listener.handle({
      bankConnectionId: 'conn-1',
      organizationId: 'org-1',
      status: 'REQUIRES_REAUTHORIZATION',
    });

    expect(tenantContext.run).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: 'org-1', role: 'OWNER' }),
      expect.any(Function),
    );
    expect(emailQueue.add).toHaveBeenCalledWith(
      'send-owner-alert',
      expect.objectContaining({
        organizationId: 'org-1',
        to: 'owner@company.vn',
        subject: 'Kết nối ngân hàng của bạn cần xác thực lại',
        html: expect.stringContaining('xác thực lại'),
        text: expect.stringContaining('xác thực lại'),
        attachments: [expect.objectContaining({ contentId: 'casso-ar-logo' })],
      }),
      expect.objectContaining({
        jobId: 'owner-alert-conn-1-REQUIRES_REAUTHORIZATION',
        attempts: 3,
      }),
    );

    const [, job] = emailQueue.add.mock.calls[0];
    expect(job.html).toContain('cid:casso-ar-logo');
    expect(job.text).toContain('xác thực lại');
    expect(job.attachments).toEqual([
      expect.objectContaining({ contentId: 'casso-ar-logo' }),
    ]);
  });

  it('enqueues an error alert to the org owner', async () => {
    const { listener, emailQueue } = buildListener(
      { userId: OWNER.userId },
      OWNER,
    );

    await listener.handle({
      bankConnectionId: 'conn-1',
      organizationId: 'org-1',
      status: 'ERROR',
    });

    expect(emailQueue.add).toHaveBeenCalledWith(
      'send-owner-alert',
      expect.objectContaining({
        to: 'owner@company.vn',
        subject: 'Kết nối ngân hàng của bạn đang gặp sự cố',
      }),
      expect.objectContaining({ jobId: 'owner-alert-conn-1-ERROR' }),
    );
  });

  it('does not enqueue when the organization has no owner email', async () => {
    const { listener, emailQueue } = buildListener(null, null);

    await listener.handle({
      bankConnectionId: 'conn-1',
      organizationId: 'org-1',
      status: 'ERROR',
    });

    expect(emailQueue.add).not.toHaveBeenCalled();
  });
});
