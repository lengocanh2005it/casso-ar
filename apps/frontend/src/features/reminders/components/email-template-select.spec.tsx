import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { EmailTemplateSelect } from './email-template-select';

const apiRequest = vi.fn();

vi.mock('@/lib/api-client', () => ({
  apiRequest: (...args: unknown[]) => apiRequest(...args),
}));

const template1 = {
  id: 't1',
  name: 'Nhắc trước hạn',
  subject: 'Sub',
  bodyHtml: '<p/>',
  reminderStage: 'DAY_3_BEFORE',
  isDefault: true,
  createdAt: '2026-08-01',
  updatedAt: '2026-08-01',
};
const template2 = {
  id: 't2',
  name: 'Nhắc quá hạn',
  subject: 'Sub2',
  bodyHtml: '<p/>',
  reminderStage: null,
  isDefault: true,
  createdAt: '2026-08-01',
  updatedAt: '2026-08-01',
};

function renderSelect(value: string, onChange = vi.fn()) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <EmailTemplateSelect
          value={value}
          onChange={onChange}
          ariaLabel="Email template 1"
        />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { onChange };
}

describe('EmailTemplateSelect', () => {
  beforeAll(() => {
    Element.prototype.scrollIntoView = vi.fn();
  });

  it('disables the trigger while loading', () => {
    apiRequest.mockReturnValue(new Promise(() => {}));
    renderSelect('');
    expect(
      screen.getByRole('combobox', { name: 'Email template 1' }),
    ).toBeDisabled();
  });

  it('shows a retry button on fetch error', async () => {
    apiRequest.mockRejectedValue(new Error('network'));
    renderSelect('');
    await waitFor(() =>
      expect(
        screen.getByRole('combobox', { name: 'Email template 1' }),
      ).toBeDisabled(),
    );
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Thử lại' })).toBeTruthy(),
    );
  });

  it('disables the trigger and links to settings when there are no templates', async () => {
    apiRequest.mockResolvedValue([]);
    renderSelect('');
    await waitFor(() =>
      expect(
        screen.getByRole('combobox', { name: 'Email template 1' }),
      ).toBeDisabled(),
    );
    expect(
      screen.getByRole('link', { name: /Tạo email template/i }),
    ).toHaveAttribute('href', '/settings?tab=templates');
  });

  it('renders template name with stage, and name only when stage is null', async () => {
    apiRequest.mockResolvedValue([template1, template2]);
    renderSelect('');
    fireEvent.click(
      await screen.findByRole('combobox', { name: 'Email template 1' }),
    );
    expect(
      screen.getByRole('option', { name: 'Nhắc trước hạn — DAY_3_BEFORE' }),
    ).toBeTruthy();
    expect(screen.getByRole('option', { name: 'Nhắc quá hạn' })).toBeTruthy();
  });

  it('calls onChange with the selected template id', async () => {
    apiRequest.mockResolvedValue([template1, template2]);
    const { onChange } = renderSelect('');
    fireEvent.click(
      await screen.findByRole('combobox', { name: 'Email template 1' }),
    );
    fireEvent.click(screen.getByRole('option', { name: 'Nhắc quá hạn' }));
    expect(onChange).toHaveBeenCalledWith('t2');
  });

  it('keeps an orphaned value visible as a disabled option', async () => {
    apiRequest.mockResolvedValue([template1]);
    renderSelect('missing-id');
    fireEvent.click(
      await screen.findByRole('combobox', { name: 'Email template 1' }),
    );
    const orphanOption = screen.getByRole('option', {
      name: /Mẫu email đã bị xóa/,
    });
    expect(orphanOption).toHaveAttribute('aria-disabled', 'true');
    expect(
      screen.getAllByText('Mẫu email đã bị xóa (mã kỹ thuật: missing-id)'),
    ).toHaveLength(2);
  });
});
