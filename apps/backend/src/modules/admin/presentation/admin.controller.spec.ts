import { Organization } from '../../organizations/domain/organization';
import { AdminController } from './admin.controller';

describe('AdminController', () => {
  describe('operator pending invite actions', () => {
    function buildController() {
      const idempotency = {
        executeForOrganization: jest.fn(
          async (
            _organizationId: string,
            _endpoint: string,
            _key: string | undefined,
            _input: unknown,
            operation: () => Promise<unknown>,
          ) => operation(),
        ),
      };
      const revokeInviteUseCase = { execute: jest.fn() };
      const resendInviteUseCase = { execute: jest.fn() };
      const controller = new AdminController(
        {} as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
        idempotency as never,
        revokeInviteUseCase as never,
        resendInviteUseCase as never,
      ) as any;
      return {
        controller,
        idempotency,
        revokeInviteUseCase,
        resendInviteUseCase,
      };
    }

    it('revokes with explicit operator inputs and an endpoint-specific idempotency key', async () => {
      const { controller, idempotency, revokeInviteUseCase } =
        buildController();

      await expect(
        controller.revokeInvite(
          'org-1',
          'invite-1',
          { user: { operatorId: 'operator-1' } },
          'revoke-key',
        ),
      ).resolves.toBeUndefined();

      expect(idempotency.executeForOrganization).toHaveBeenCalledWith(
        'org-1',
        'DELETE /admin/organizations/org-1/invites/invite-1',
        'revoke-key',
        { inviteId: 'invite-1' },
        expect.any(Function),
      );
      expect(revokeInviteUseCase.execute).toHaveBeenCalledWith({
        organizationId: 'org-1',
        inviteId: 'invite-1',
        operatorId: 'operator-1',
      });
    });

    it('resends with explicit operator inputs and returns success', async () => {
      const { controller, idempotency, resendInviteUseCase } =
        buildController();

      await expect(
        controller.resendInvite(
          'org-1',
          'invite-1',
          { user: { operatorId: 'operator-1' } },
          'resend-key',
        ),
      ).resolves.toEqual({ success: true });

      expect(idempotency.executeForOrganization).toHaveBeenCalledWith(
        'org-1',
        'POST /admin/organizations/org-1/invites/invite-1/resend',
        'resend-key',
        { inviteId: 'invite-1' },
        expect.any(Function),
      );
      expect(resendInviteUseCase.execute).toHaveBeenCalledWith({
        organizationId: 'org-1',
        inviteId: 'invite-1',
        operatorId: 'operator-1',
      });
    });
  });

  describe('organization detail endpoint', () => {
    it('maps the domain organization into the response DTO', async () => {
      const getOrganizationUseCase = {
        execute: jest.fn().mockResolvedValue(
          new Organization({
            id: 'org-1',
            name: 'Acme',
            createdAt: new Date('2026-08-01'),
          }),
        ),
      };
      const controller = new AdminController(
        {} as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
        getOrganizationUseCase as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
      );

      const result = await controller.getOrganization('org-1');

      expect(result).toEqual({
        id: 'org-1',
        name: 'Acme',
        status: 'ACTIVE',
        taxCode: '',
        taxCodeMatched: false,
        taxCodeLookupName: null,
        createdAt: new Date('2026-08-01'),
      });
      expect(result).not.toBeInstanceOf(Organization);
      expect(getOrganizationUseCase.execute).toHaveBeenCalledWith({
        organizationId: 'org-1',
      });
    });
  });

  describe('date-only "to" range handling', () => {
    const getAiUsageAggregateUseCase = {
      execute: jest.fn().mockResolvedValue([]),
    };
    const getAiUsageTrendUseCase = { execute: jest.fn().mockResolvedValue([]) };
    const controller = new AdminController(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      getAiUsageAggregateUseCase as never,
      getAiUsageTrendUseCase as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    afterEach(() => jest.clearAllMocks());

    it('extends a date-only "to" to the end of that day so same-day ranges are not empty', async () => {
      await controller.getAiUsage({ from: '2026-08-15', to: '2026-08-15' });

      const { from, to } = getAiUsageAggregateUseCase.execute.mock.calls[0][0];
      expect(from).toEqual(new Date('2026-08-15T00:00:00.000Z'));
      expect(to).toEqual(new Date('2026-08-15T23:59:59.999Z'));
    });

    it('applies the same end-of-day extension to the trend endpoint', async () => {
      await controller.getAiUsageTrend({
        from: '2026-08-01',
        to: '2026-08-07',
      });

      const { to } = getAiUsageTrendUseCase.execute.mock.calls[0][0];
      expect(to).toEqual(new Date('2026-08-07T23:59:59.999Z'));
    });
  });
});
