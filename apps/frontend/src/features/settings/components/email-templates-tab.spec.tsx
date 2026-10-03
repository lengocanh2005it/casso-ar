import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { EmailTemplatesTab } from './email-templates-tab';

const { apiRequest, useAuth } = vi.hoisted(() => ({
  apiRequest: vi.fn(),
  useAuth: vi.fn(),
}));

vi.mock('@/lib/api-client', () => ({
  apiRequest: (...args: unknown[]) => apiRequest(...args),
  authTokenManager: { getValidAccessToken: vi.fn().mockResolvedValue('t') },
}));
vi.mock('@/contexts/auth-context', () => ({
  useAuth,
}));

const template = {
  id: 't1',
  name: 'Due date reminder',
  subject: 'Payment reminder {{invoiceNumber}}',
  bodyHtml: '<p>Dear {{customerName}}…</p>',
  reminderStage: null,
  isDefault: true,
  createdAt: '2026-08-01',
  updatedAt: '2026-08-01',
  attachments: [],
};

describe('EmailTemplatesTab', () => {
  it('lists templates and renders a preview', async () => {
    useAuth.mockReturnValue({ user: { role: 'OWNER' } });
    apiRequest.mockResolvedValueOnce([template]).mockResolvedValueOnce({
      subject: 'Payment reminder INV-1',
      bodyHtml: '<p>Dear Company B…</p>',
    });
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <EmailTemplatesTab />
      </QueryClientProvider>,
    );

    const title = screen.getByText('Mẫu email');
    const heading = title.closest('[data-slot="card-heading"]');
    expect(heading).toContainElement(
      screen.getByText(
        'Quản lý nội dung email dùng trong các chính sách nhắc.',
      ),
    );
    expect(heading?.parentElement).toContainElement(
      screen.getByRole('button', { name: 'Tạo mẫu email' }),
    );

    await waitFor(() =>
      expect(screen.getByText('Due date reminder')).toBeTruthy(),
    );
    fireEvent.click(
      screen.getByRole('button', { name: /xem trước mẫu email/i }),
    );
    await waitFor(() =>
      expect(screen.getByText('Payment reminder INV-1')).toBeTruthy(),
    );
  });

  it('keeps read access while hiding template mutations', async () => {
    useAuth.mockReturnValue({ user: { role: 'ACCOUNTANT' } });
    apiRequest.mockResolvedValueOnce([template]);
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <EmailTemplatesTab />
      </QueryClientProvider>,
    );

    await waitFor(() =>
      expect(screen.getByText('Due date reminder')).toBeTruthy(),
    );
    expect(
      screen.queryByRole('button', { name: /xem trước mẫu email/i }),
    ).toBeNull();
    expect(screen.queryByRole('button', { name: /tạo mẫu/i })).toBeNull();
  });

  it('labels template details and distinguishes custom templates', async () => {
    useAuth.mockReturnValue({ user: { role: 'OWNER' } });
    apiRequest.mockResolvedValueOnce([
      { ...template, id: 't2', name: 'Custom reminder', isDefault: false },
    ]);
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <EmailTemplatesTab />
      </QueryClientProvider>,
    );

    const row = await screen.findByRole('row', { name: /Custom reminder/i });
    expect(within(row).getByText('Tiêu đề')).toBeTruthy();
    expect(within(row).getByText('Loại')).toBeTruthy();
    expect(within(row).getByText('Tùy chỉnh')).toBeTruthy();
  });

  it('keeps the labeled template layout through tablet widths', async () => {
    useAuth.mockReturnValue({ user: { role: 'OWNER' } });
    apiRequest.mockResolvedValueOnce([template]);
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    const { container } = render(
      <QueryClientProvider client={queryClient}>
        <EmailTemplatesTab />
      </QueryClientProvider>,
    );

    const row = await screen.findByRole('row', { name: /Due date reminder/i });
    expect(within(row).getByText('Tiêu đề')).toBeInTheDocument();
    expect(within(row).getByText('Loại')).toBeInTheDocument();
    expect(
      within(row).getByRole('button', { name: 'Xóa' }),
    ).toBeInTheDocument();
    expect(container.querySelector('table')).toHaveClass('block', 'xl:table');
    expect(row).toHaveClass('xl:table-row');
  });

  it('refreshes attachments in the open editor after upload', async () => {
    useAuth.mockReturnValue({ user: { role: 'OWNER' } });
    const attachment = {
      id: 'a1',
      filename: 'brand.png',
      mimeType: 'image/png',
      sizeBytes: 1024,
      createdAt: '2026-08-01',
    };
    let listFetches = 0;
    apiRequest.mockImplementation(
      ({ url, method }: { url: string; method: string }) => {
        if (url === '/api/v1/email-templates' && method === 'GET') {
          listFetches += 1;
          return Promise.resolve([
            listFetches === 1
              ? template
              : { ...template, attachments: [attachment] },
          ]);
        }
        if (url === '/api/v1/email-templates/t1/attachments') {
          return Promise.resolve(attachment);
        }
        return Promise.resolve([]);
      },
    );
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <EmailTemplatesTab />
      </QueryClientProvider>,
    );

    await waitFor(() =>
      expect(screen.getByText('Due date reminder')).toBeTruthy(),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Sửa' }));
    fireEvent.change(screen.getByLabelText('Chọn tệp gửi kèm'), {
      target: {
        files: [new File(['image'], 'brand.png', { type: 'image/png' })],
      },
    });

    await waitFor(() => expect(listFetches).toBe(2));
    expect(screen.getByText('1/5')).toBeTruthy();
    expect(screen.getByText('brand.png')).toBeTruthy();
  });
});
