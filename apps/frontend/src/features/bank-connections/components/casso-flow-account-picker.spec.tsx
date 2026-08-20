import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CassoFlowAccountPicker } from './casso-flow-account-picker';

describe('CassoFlowAccountPicker', () => {
  it('previews accounts and submits the checked accounts', async () => {
    const onPreview = vi.fn().mockResolvedValue({
      businessId: 'biz-1',
      accounts: [
        {
          accountNumber: '111',
          bankName: 'VPBank',
          accountHolderName: 'NGUYEN VAN A',
          status: 'AVAILABLE',
        },
        {
          accountNumber: '222',
          bankName: 'ACB',
          accountHolderName: 'NGUYEN VAN A',
          status: 'ALREADY_CONNECTED',
        },
        {
          accountNumber: '333',
          bankName: 'Techcombank',
          accountHolderName: 'NGUYEN VAN A',
          status: 'TAKEN_BY_ANOTHER_ORG',
        },
      ],
    });
    const onConfirm = vi.fn().mockResolvedValue({ connected: [], skipped: [] });

    render(
      <CassoFlowAccountPicker onPreview={onPreview} onConfirm={onConfirm} />,
    );

    fireEvent.change(screen.getByLabelText(/Casso Flow API Key/i), {
      target: { value: 'test-key' },
    });
    fireEvent.click(screen.getByRole('button', { name: /xem tài khoản/i }));

    await waitFor(() =>
      expect(screen.getByRole('checkbox', { name: /111/ })).toBeInTheDocument(),
    );

    expect(screen.getByRole('checkbox', { name: /111/ })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: /222/ })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: /222/ })).toBeDisabled();
    expect(screen.getByRole('checkbox', { name: /333/ })).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: /333/ })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: /xác nhận/i }));

    await waitFor(() =>
      expect(onConfirm).toHaveBeenCalledWith('test-key', ['111', '222']),
    );
  });

  it('shows skipped account reasons after a partial confirmation', async () => {
    const onPreview = vi.fn().mockResolvedValue({
      businessId: 'biz-1',
      accounts: [
        {
          accountNumber: '111',
          bankName: 'VPBank',
          accountHolderName: 'NGUYEN VAN A',
          status: 'AVAILABLE',
        },
      ],
    });
    const onConfirm = vi.fn().mockResolvedValue({
      connected: [],
      skipped: [{ accountNumber: '111', reason: 'PLAN_LIMIT_EXCEEDED' }],
    });

    render(
      <CassoFlowAccountPicker onPreview={onPreview} onConfirm={onConfirm} />,
    );

    fireEvent.change(screen.getByLabelText(/Casso Flow API Key/i), {
      target: { value: 'test-key' },
    });
    fireEvent.click(screen.getByRole('button', { name: /xem tài khoản/i }));
    await waitFor(() =>
      expect(screen.getByRole('checkbox', { name: /111/ })).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByRole('button', { name: /xác nhận/i }));

    expect(
      await screen.findByText(/111.*vượt hạn mức gói dịch vụ/i),
    ).toBeInTheDocument();
  });
});
