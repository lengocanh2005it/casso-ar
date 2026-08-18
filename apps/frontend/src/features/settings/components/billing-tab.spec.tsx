import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { BillingTab } from './billing-tab';

const { useAuth } = vi.hoisted(() => ({ useAuth: vi.fn() }));
const { mutate, useInitiatePlanUpgrade } = vi.hoisted(() => ({
  mutate: vi.fn(),
  useInitiatePlanUpgrade: vi.fn(),
}));
const { PaymentDialog } = vi.hoisted(() => ({
  PaymentDialog: vi.fn(() => null),
}));

vi.mock('@/contexts/auth-context', () => ({ useAuth }));
vi.mock('../api/use-settings', () => ({ useInitiatePlanUpgrade }));
vi.mock('./payment-dialog', () => ({ PaymentDialog }));

describe('BillingTab', () => {
  it('shows an upgrade button only on plans above the current plan, for a user with SUBSCRIPTION_MANAGE', () => {
    useAuth.mockReturnValue({
      user: { role: 'OWNER', subscriptionPlan: 'STARTER' },
      refreshUser: vi.fn(),
    });
    useInitiatePlanUpgrade.mockReturnValue({ mutate, isPending: false });

    render(<BillingTab />);

    const upgradeButtons = screen.getAllByRole('button', { name: 'Nâng cấp' });
    expect(upgradeButtons).toHaveLength(2); // BUSINESS, ENTERPRISE (not FREE, not current STARTER)
  });

  it('hides every upgrade button when the user lacks SUBSCRIPTION_MANAGE', () => {
    useAuth.mockReturnValue({
      user: { role: 'VIEWER', subscriptionPlan: 'FREE' },
      refreshUser: vi.fn(),
    });
    useInitiatePlanUpgrade.mockReturnValue({ mutate, isPending: false });

    render(<BillingTab />);

    expect(
      screen.queryByRole('button', { name: 'Nâng cấp' }),
    ).not.toBeInTheDocument();
  });

  it('initiates a checkout order for the clicked plan', () => {
    useAuth.mockReturnValue({
      user: { role: 'OWNER', subscriptionPlan: 'FREE' },
      refreshUser: vi.fn(),
    });
    useInitiatePlanUpgrade.mockReturnValue({ mutate, isPending: false });

    render(<BillingTab />);

    const [firstUpgradeButton] = screen.getAllByRole('button', {
      name: 'Nâng cấp',
    });
    fireEvent.click(firstUpgradeButton);

    expect(mutate).toHaveBeenCalledWith(
      expect.objectContaining({ targetPlanId: 'STARTER' }),
      expect.anything(),
    );
  });
});
