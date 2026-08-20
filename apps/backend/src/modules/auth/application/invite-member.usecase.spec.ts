import { InviteMemberUseCase } from './invite-member.usecase';

describe('InviteMemberUseCase', () => {
  const previousCorsOrigin = process.env.CORS_ORIGIN;

  afterEach(() => {
    if (previousCorsOrigin === undefined) {
      delete process.env.CORS_ORIGIN;
    } else {
      process.env.CORS_ORIGIN = previousCorsOrigin;
    }
  });

  it('emails an absolute invite-accept link matching the frontend route', async () => {
    process.env.CORS_ORIGIN = 'https://app.casso.vn';
    const inviteRepo = { save: jest.fn() };
    const emailSender = { sendInviteEmail: jest.fn() };
    const dataSource = {
      transaction: jest.fn(
        async (callback: (manager: object) => Promise<void>) => callback({}),
      ),
    };
    const useCase = new InviteMemberUseCase(
      inviteRepo as any,
      emailSender as any,
      dataSource as any,
    );

    await useCase.execute({
      organizationId: 'org-1',
      organizationName: 'Acme',
      email: 'New@Acme.vn',
      role: 'VIEWER' as any,
      invitedByUserId: 'user-1',
    });

    expect(inviteRepo.save).toHaveBeenCalled();
    expect(emailSender.sendInviteEmail).toHaveBeenCalledWith(
      'new@acme.vn',
      expect.stringMatching(/^https:\/\/app\.casso\.vn\/invite-accept\?token=/),
      'Acme',
    );
  });
});
