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
});
