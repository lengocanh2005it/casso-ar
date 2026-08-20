import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import * as api from '../api/bank-connections-api';
import { CassoFlowConnectForm } from './casso-flow-connect-form';

vi.mock('../api/bank-connections-api');

function renderWithQuery(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>,
  );
}

describe('CassoFlowConnectForm', () => {
  it('renders input for api key and calls connect mutation', async () => {
    const onCompleted = vi.fn();
    const mockConnect = vi.spyOn(api, 'connectCassoFlow').mockResolvedValue({
      id: 'conn-1',
      accountNumber: '88888888',
      bankName: 'VPBank',
      status: 'ACTIVE',
      connectedAt: '2026-08-19T00:00:00.000Z',
      lastSyncAt: null,
      createdAt: '2026-08-19T00:00:00.000Z',
    });

    renderWithQuery(<CassoFlowConnectForm onCompleted={onCompleted} />);

    const input = screen.getByLabelText(/Casso Flow API Key/i);
    const submitBtn = screen.getByRole('button', { name: /Kết nối/i });

    fireEvent.change(input, { target: { value: 'my-test-api-key' } });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(mockConnect).toHaveBeenCalledWith({ apiKey: 'my-test-api-key' });
      expect(onCompleted).toHaveBeenCalled();
    });
  });

  it('passes bankConnectionId and shows "Kết nối lại" for the reconnect case', async () => {
    const mockConnect = vi.spyOn(api, 'connectCassoFlow').mockResolvedValue({
      id: 'conn-1',
      accountNumber: '88888888',
      bankName: 'VPBank',
      status: 'ACTIVE',
      connectedAt: '2026-08-19T00:00:00.000Z',
      lastSyncAt: null,
      createdAt: '2026-08-19T00:00:00.000Z',
    });

    renderWithQuery(<CassoFlowConnectForm bankConnectionId="conn-1" />);

    const input = screen.getByLabelText(/Casso Flow API Key/i);
    const submitBtn = screen.getByRole('button', { name: /Kết nối lại/i });

    fireEvent.change(input, { target: { value: 'new-api-key' } });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(mockConnect).toHaveBeenCalledWith({
        apiKey: 'new-api-key',
        bankConnectionId: 'conn-1',
      });
    });
  });

  it('toggles the API key field between masked and plain text', () => {
    renderWithQuery(<CassoFlowConnectForm />);

    const input = screen.getByLabelText(/Casso Flow API Key/i);
    expect(input).toHaveAttribute('type', 'password');

    fireEvent.click(screen.getByRole('button', { name: /hiện mã api key/i }));
    expect(input).toHaveAttribute('type', 'text');

    fireEvent.click(screen.getByRole('button', { name: /ẩn mã api key/i }));
    expect(input).toHaveAttribute('type', 'password');
  });
});
