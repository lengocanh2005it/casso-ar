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
const { usePlans } = vi.hoisted(() => ({ usePlans: vi.fn() }));

vi.mock('@/contexts/auth-context', () => ({ useAuth }));
vi.mock('../api/use-settings', () => ({ useInitiatePlanUpgrade }));
vi.mock('./payment-dialog', () => ({ PaymentDialog }));
vi.mock('@/features/plans/hooks/use-plans', () => ({ usePlans }));

const planCatalog = [
  {
    planId: 'FREE',
    priceVnd: 0,
    receivableMonthlyLimit: 50,
    bankConnectionLimit: 1,
    copilotChatMonthlyLimit: 50,
  },
  {
    planId: 'STARTER',
    priceVnd: 299_000,
    receivableMonthlyLimit: 500,
    bankConnectionLimit: 2,
    copilotChatMonthlyLimit: 100,
  },
  {
    planId: 'BUSINESS',
    priceVnd: 999_000,
    receivableMonthlyLimit: 5000,
    bankConnectionLimit: 5,
    copilotChatMonthlyLimit: 1000,
  },
  {
    planId: 'ENTERPRISE',
    priceVnd: 2_999_000,
    receivableMonthlyLimit: 15000,
    bankConnectionLimit: 10,
    copilotChatMonthlyLimit: 10000,
  },
];

describe('BillingTab', () => {
  it('shows catalog prices and all plan limits with value details', () => {
    useAuth.mockReturnValue({
      user: { role: 'OWNER', subscriptionPlan: 'STARTER' },
      refreshUser: vi.fn(),
    });
    useInitiatePlanUpgrade.mockReturnValue({ mutate, isPending: false });
    usePlans.mockReturnValue({ data: planCatalog, isLoading: false });

    render(<BillingTab />);

    expect(screen.getByText(/299\.000/)).toBeInTheDocument();
    expect(screen.getByText('500').closest('li')).toHaveTextContent(
      '500 khoản phải thu/tháng',
    );
    expect(screen.getByText('2').closest('li')).toHaveTextContent(
      '2 kết nối ngân hàng',
    );
    expect(screen.getByText('100').closest('li')).toHaveTextContent(
      '100 lượt hỏi đáp AI/tháng',
    );
    expect(screen.getByText('Nhắc nợ tự động qua email')).toBeInTheDocument();
    expect(
      screen.queryByText('Không giới hạn số kết nối ngân hàng'),
    ).not.toBeInTheDocument();
    expect(screen.getByText('Hỗ trợ ưu tiên')).toBeInTheDocument();
  });

  it('announces loading and provides a retry action when the catalog fails', () => {
    const refetch = vi.fn();
    useAuth.mockReturnValue({
      user: { role: 'OWNER', subscriptionPlan: 'FREE' },
      refreshUser: vi.fn(),
    });
    useInitiatePlanUpgrade.mockReturnValue({ mutate, isPending: false });
    usePlans.mockReturnValue({
      isLoading: true,
      isError: false,
      refetch,
    });

    const { rerender } = render(<BillingTab />);
    expect(screen.getByRole('status')).toHaveTextContent('Đang tải các gói');

    usePlans.mockReturnValue({ isLoading: false, isError: true, refetch });
    rerender(<BillingTab />);
    fireEvent.click(screen.getByRole('button', { name: 'Thử lại' }));

    expect(refetch).toHaveBeenCalledOnce();
  });

  it('shows an upgrade button only on plans above the current plan, for a user with SUBSCRIPTION_MANAGE', () => {
    useAuth.mockReturnValue({
      user: { role: 'OWNER', subscriptionPlan: 'STARTER' },
      refreshUser: vi.fn(),
    });
    useInitiatePlanUpgrade.mockReturnValue({ mutate, isPending: false });
    usePlans.mockReturnValue({ data: planCatalog, isLoading: false });

    render(<BillingTab />);

    expect(screen.getByText('Khởi đầu')).toBeInTheDocument();
    expect(screen.getByText('Chuyên nghiệp')).toBeInTheDocument();
    const upgradeButtons = screen.getAllByRole('button', { name: 'Nâng cấp' });
    expect(upgradeButtons).toHaveLength(2); // BUSINESS, ENTERPRISE (not FREE, not current STARTER)
  });

  it('hides every upgrade button when the user lacks SUBSCRIPTION_MANAGE', () => {
    useAuth.mockReturnValue({
      user: { role: 'VIEWER', subscriptionPlan: 'FREE' },
      refreshUser: vi.fn(),
    });
    useInitiatePlanUpgrade.mockReturnValue({ mutate, isPending: false });
    usePlans.mockReturnValue({ data: planCatalog, isLoading: false });

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
    usePlans.mockReturnValue({ data: planCatalog, isLoading: false });

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
