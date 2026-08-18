import { fireEvent, render } from '@testing-library/react';
import { toast } from 'sonner';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PaymentDialog } from './payment-dialog';

const { useAuth } = vi.hoisted(() => ({ useAuth: vi.fn() }));
const { QRCodeSVG } = vi.hoisted(() => ({ QRCodeSVG: vi.fn(() => null) }));

vi.mock('@/contexts/auth-context', () => ({ useAuth }));
vi.mock('qrcode.react', () => ({ QRCodeSVG }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const checkoutUrl = 'https://pay.payos.vn/web/abc123';

function mockAuth(subscriptionPlan: string, refreshUser = vi.fn()) {
  useAuth.mockReturnValue({
    user: { role: 'OWNER', subscriptionPlan },
    refreshUser,
  });
  return refreshUser;
}

describe('PaymentDialog', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('renders a QR code encoding the checkout URL', () => {
    mockAuth('FREE');

    render(
      <PaymentDialog open onOpenChange={vi.fn()} checkoutUrl={checkoutUrl} />,
    );

    expect(QRCodeSVG).toHaveBeenCalledWith(
      expect.objectContaining({ value: checkoutUrl }),
      undefined,
    );
  });

  it('opens the checkout URL in a new tab', () => {
    mockAuth('FREE');
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);

    const { getByRole } = render(
      <PaymentDialog open onOpenChange={vi.fn()} checkoutUrl={checkoutUrl} />,
    );
    fireEvent.click(getByRole('button', { name: 'Mở trang thanh toán PayOS' }));

    expect(openSpy).toHaveBeenCalledWith(checkoutUrl, '_blank');
  });

  it('polls refreshUser every 5s while open', () => {
    vi.useFakeTimers();
    const refreshUser = mockAuth('FREE');

    render(
      <PaymentDialog open onOpenChange={vi.fn()} checkoutUrl={checkoutUrl} />,
    );

    vi.advanceTimersByTime(11_000);

    expect(refreshUser).toHaveBeenCalledTimes(2);
  });

  it('does not poll when closed', () => {
    vi.useFakeTimers();
    const refreshUser = mockAuth('FREE');

    render(
      <PaymentDialog
        open={false}
        onOpenChange={vi.fn()}
        checkoutUrl={checkoutUrl}
      />,
    );

    vi.advanceTimersByTime(11_000);

    expect(refreshUser).not.toHaveBeenCalled();
  });

  it('closes and shows a success toast when the subscription plan changes', () => {
    mockAuth('FREE');

    const onOpenChange = vi.fn();
    const { rerender } = render(
      <PaymentDialog
        open
        onOpenChange={onOpenChange}
        checkoutUrl={checkoutUrl}
      />,
    );

    mockAuth('STARTER');
    rerender(
      <PaymentDialog
        open
        onOpenChange={onOpenChange}
        checkoutUrl={checkoutUrl}
      />,
    );

    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(toast.success).toHaveBeenCalledWith('Nâng cấp gói thành công!');
  });
});
