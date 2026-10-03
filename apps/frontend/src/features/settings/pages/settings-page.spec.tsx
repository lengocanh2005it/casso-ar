import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SettingsPage } from './settings-page';

const { setParam, useAuth, useUrlQueryParams } = vi.hoisted(() => ({
  setParam: vi.fn(),
  useAuth: vi.fn(),
  useUrlQueryParams: vi.fn(),
}));

vi.mock('@/contexts/auth-context', () => ({ useAuth }));
vi.mock('@/lib/use-url-query-params', () => ({ useUrlQueryParams }));
vi.mock('../components/appearance-tab', () => ({
  AppearanceTab: () => <div>Appearance panel</div>,
}));
vi.mock('../components/pending-ownership-transfer-banner', () => ({
  PendingOwnershipTransferBanner: () => null,
}));

describe('SettingsPage mobile navigation', () => {
  beforeEach(() => {
    useAuth.mockReturnValue({ user: { role: 'OWNER' } });
    useUrlQueryParams.mockReturnValue({
      searchParams: new URLSearchParams('tab=webhook-inbox'),
      setParam,
    });
  });

  it('keeps the active tab visible and hides other tabs until expanded', () => {
    render(<SettingsPage />);

    expect(
      screen.getByRole('button', { name: 'Xem thêm 5 mục' }),
    ).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByRole('tab', { name: 'Webhook' })).not.toHaveClass(
      'max-lg:hidden',
    );
    expect(screen.getByRole('tab', { name: 'Thanh toán' })).toHaveClass(
      'max-lg:hidden',
    );
    expect(
      screen.getByRole('button', { name: 'Xem thêm 5 mục' }).parentElement,
    ).toHaveClass('lg:hidden');
  });

  it('expands the complete tab list on demand and collapses it again', () => {
    render(<SettingsPage />);

    fireEvent.click(screen.getByRole('button', { name: 'Xem thêm 5 mục' }));
    expect(screen.getByRole('button', { name: 'Thu gọn' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    expect(screen.getByRole('tab', { name: 'Thanh toán' })).not.toHaveClass(
      'max-lg:hidden',
    );

    fireEvent.click(screen.getByRole('button', { name: 'Thu gọn' }));
    expect(
      screen.getByRole('button', { name: 'Xem thêm 5 mục' }),
    ).toHaveAttribute('aria-expanded', 'false');
  });

  it('closes the expanded list after a tab is selected', () => {
    render(<SettingsPage />);

    fireEvent.click(screen.getByRole('button', { name: 'Xem thêm 5 mục' }));
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Thanh toán' }));

    expect(setParam).toHaveBeenCalledWith('tab', 'billing');
    expect(
      screen.getByRole('button', { name: 'Xem thêm 5 mục' }),
    ).toHaveAttribute('aria-expanded', 'false');
  });
});
