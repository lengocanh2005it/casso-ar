import { Role } from '@casso-ledger/shared-types';
import { Membership } from '../../domain/membership';
import { toMemberResponse } from './member-response.dto';

describe('toMemberResponse', () => {
  it('includes membership status and blockedAt for the frontend member list', () => {
    const membership = new Membership({
      id: 'm1',
      organizationId: 'org-1',
      userId: 'user-1',
      role: Role.ACCOUNTANT,
      invitedAt: new Date('2026-08-01'),
      joinedAt: new Date('2026-08-02'),
      createdAt: new Date('2026-08-01'),
      status: 'BLOCKED',
      blockedAt: new Date('2026-08-10'),
    });

    const dto = toMemberResponse(membership, {
      email: 'ke-toan@congtyb.vn',
      name: 'Kế toán',
    });

    expect(dto).toEqual({
      id: 'm1',
      userId: 'user-1',
      email: 'ke-toan@congtyb.vn',
      name: 'Kế toán',
      role: Role.ACCOUNTANT,
      joinedAt: new Date('2026-08-02'),
      status: 'BLOCKED',
      blockedAt: new Date('2026-08-10'),
    });
  });
});
