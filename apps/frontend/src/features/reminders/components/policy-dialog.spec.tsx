import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { ReminderPolicy } from '../types';
import { PolicyDialog } from './policy-dialog';

const { apiRequest, useAuth } = vi.hoisted(() => ({
  apiRequest: vi.fn(),
  useAuth: vi.fn(),
}));

vi.mock('@/lib/api-client', () => ({
  apiRequest: (...args: unknown[]) => apiRequest(...args),
  postWithIdempotency: (url: string, data: unknown) =>
    apiRequest({ url, method: 'POST', data }),
}));
vi.mock('@/contexts/auth-context', () => ({ useAuth }));

const template = {
  id: 't1',
  name: 'Nhắc trước hạn',
  subject: 'Sub',
  bodyHtml: '<p/>',
  reminderStage: 'DAY_3_BEFORE',
  isDefault: true,
  createdAt: '2026-08-01',
  updatedAt: '2026-08-01',
};

function renderDialog(policy: ReminderPolicy | null = null) {
  useAuth.mockReturnValue({ user: { role: 'OWNER' } });
  apiRequest.mockImplementation((config: { url: string; method: string }) => {
    if (config.url === '/api/v1/email-templates') {
      return Promise.resolve([template]);
    }
    return Promise.resolve({ id: 'p1' });
  });
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <PolicyDialog policy={policy} open onOpenChange={vi.fn()} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('PolicyDialog', () => {
  beforeAll(() => {
    Element.prototype.scrollIntoView = vi.fn();
  });

  it('blocks submit with a toast when no template is selected for a rule', async () => {
    renderDialog();
    await screen.findByRole('combobox', { name: /Email template 1/i });

    fireEvent.click(screen.getByRole('button', { name: 'Lưu chính sách' }));

    expect(apiRequest).not.toHaveBeenCalledWith(
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('submits the selected template UUID as emailTemplateId', async () => {
    renderDialog();
    fireEvent.click(
      await screen.findByRole('combobox', { name: /Email template 1/i }),
    );
    fireEvent.click(screen.getByRole('option', { name: /Nhắc trước hạn/i }));

    fireEvent.click(screen.getByRole('button', { name: 'Lưu chính sách' }));

    await waitFor(() =>
      expect(apiRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'POST',
          url: '/api/v1/reminder-policies',
          data: expect.objectContaining({
            rules: [expect.objectContaining({ emailTemplateId: 't1' })],
          }),
        }),
      ),
    );
  });

  it('pre-selects the existing template when editing a policy', async () => {
    const policy: ReminderPolicy = {
      id: 'policy-1',
      customerGroup: 'REGULAR',
      isActive: true,
      escalationThresholdDays: null,
      rules: [
        {
          id: 'rule-1',
          offsetDays: -3,
          emailTemplateId: 't1',
          minIntervalDays: 1,
        },
      ],
      createdAt: '2026-08-01T00:00:00Z',
    };
    renderDialog(policy);

    const trigger = await screen.findByRole('combobox', {
      name: /Email template 1/i,
    });
    await waitFor(() =>
      expect(trigger).toHaveTextContent('Nhắc trước hạn — DAY_3_BEFORE'),
    );
  });
});
