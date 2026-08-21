import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CassoFlowAccountPicker } from './casso-flow-account-picker';

const dispatchGlobalEvent = vi.hoisted(() => vi.fn());

vi.mock('@/lib/global-events', () => ({
  GLOBAL_EVENTS: { PLAN_LIMIT: 'casso:plan-limit' },
  dispatchGlobalEvent,
}));

beforeEach(() => {
  dispatchGlobalEvent.mockReset();
});

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
    expect(dispatchGlobalEvent).toHaveBeenCalledWith('casso:plan-limit');
  });

  it('shows missing accounts as informational during API-key rotation', async () => {
    const onPreview = vi.fn().mockResolvedValue({
      businessId: 'biz-1',
      accounts: [],
      missingAccountNumbers: ['999'],
    });

    render(
      <CassoFlowAccountPicker
        onPreview={onPreview}
        onConfirm={vi.fn().mockResolvedValue({
          rotatedAccountNumbers: [],
          newlyDiscovered: [],
        })}
      />,
    );

    fireEvent.change(screen.getByLabelText(/Casso Flow API Key/i), {
      target: { value: 'replacement-key' },
    });
    fireEvent.click(screen.getByRole('button', { name: /xem tài khoản/i }));

    expect(
      await screen.findByText(
        /999.*không tìm thấy trong API Key mới, sẽ giữ nguyên trạng thái hiện tại/i,
      ),
    ).toBeInTheDocument();
  });

  it('wraps long account numbers in skipped-account feedback', async () => {
    const accountNumber = `9704${'1'.repeat(70)}`;
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
      skipped: [{ accountNumber, reason: 'PLAN_LIMIT_EXCEEDED' }],
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

    const accountList = await screen.findByRole('list');
    expect(accountList).toHaveClass('break-words');
    expect(accountList).toHaveTextContent(accountNumber);
  });

  it('contains long account numbers and wraps long account-holder names', async () => {
    const accountNumber = `9704${'1'.repeat(70)}`;
    const accountHolderName = `NGUYEN VAN ${'A'.repeat(70)}`;
    const onPreview = vi.fn().mockResolvedValue({
      businessId: 'biz-1',
      accounts: [
        {
          accountNumber,
          bankName: 'VPBank',
          accountHolderName,
          status: 'AVAILABLE',
        },
      ],
    });

    render(
      <CassoFlowAccountPicker
        onPreview={onPreview}
        onConfirm={vi.fn().mockResolvedValue({ connected: [], skipped: [] })}
      />,
    );

    fireEvent.change(screen.getByLabelText(/Casso Flow API Key/i), {
      target: { value: 'test-key' },
    });
    fireEvent.click(screen.getByRole('button', { name: /xem tài khoản/i }));

    const account = await screen.findByText(accountNumber);
    expect(account).toHaveClass('truncate');
    expect(account).toHaveAttribute('title', accountNumber);
    expect(screen.getByText(new RegExp(accountHolderName))).toHaveClass(
      'break-words',
    );
  });
});
