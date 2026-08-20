import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PolicyDialog } from './policy-dialog';

const {
  useAuth,
  useEmailTemplates,
  useCreateReminderPolicy,
  useUpdateReminderPolicy,
} = vi.hoisted(() => ({
  useAuth: vi.fn(),
  useEmailTemplates: vi.fn(),
  useCreateReminderPolicy: vi.fn(),
  useUpdateReminderPolicy: vi.fn(),
}));

vi.mock('@/contexts/auth-context', () => ({ useAuth }));
vi.mock('@/features/settings/api/use-settings', () => ({ useEmailTemplates }));
vi.mock('../api/use-reminders', () => ({
  useCreateReminderPolicy,
  useUpdateReminderPolicy,
}));

const createMutation = { mutate: vi.fn(), isPending: false };
const updateMutation = { mutate: vi.fn(), isPending: false };

const template = {
  id: 'template-1',
  name: 'Nhắc trước hạn 3 ngày',
  subject: 'Nhắc thanh toán {{invoiceNumber}}',
  bodyHtml: '<p>Dear {{customerName}}</p>',
  reminderStage: 'Nhắc trước hạn 3 ngày',
  isDefault: true,
  createdAt: '2026-08-21T00:00:00.000Z',
  updatedAt: '2026-08-21T00:00:00.000Z',
};

describe('PolicyDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    HTMLElement.prototype.scrollIntoView = vi.fn();
    useAuth.mockReturnValue({ user: { role: 'OWNER' } });
    useEmailTemplates.mockReturnValue({
      data: [template],
      isPending: false,
      isError: false,
    });
    createMutation.mutate.mockClear();
    updateMutation.mutate.mockClear();
    useCreateReminderPolicy.mockReturnValue(createMutation);
    useUpdateReminderPolicy.mockReturnValue(updateMutation);
  });

  it('lets users choose a template by name and submits its UUID', () => {
    render(<PolicyDialog policy={null} open onOpenChange={vi.fn()} />);

    fireEvent.click(screen.getByRole('combobox', { name: 'Mẫu email 1' }));
    fireEvent.click(
      screen.getByRole('option', {
        name: 'Nhắc trước hạn 3 ngày (Mặc định)',
      }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Lưu chính sách' }));

    expect(createMutation.mutate).toHaveBeenCalledWith(
      expect.objectContaining({
        rules: [expect.objectContaining({ emailTemplateId: 'template-1' })],
      }),
      expect.any(Object),
    );
  });

  it.each([
    [
      'loading',
      { data: undefined, isPending: true, isError: false },
      'Đang tải mẫu email…',
    ],
    [
      'error',
      { data: undefined, isPending: false, isError: true },
      'Không thể tải mẫu email. Vui lòng thử lại.',
    ],
    [
      'empty',
      { data: [], isPending: false, isError: false },
      'Chưa có mẫu email. Hãy tạo mẫu email trước khi lập chính sách nhắc.',
    ],
  ])(
    'disables policy actions while template list is %s',
    (_state, query, message) => {
      useEmailTemplates.mockReturnValue(query);

      render(<PolicyDialog policy={null} open onOpenChange={vi.fn()} />);

      expect(screen.getByText(message)).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: 'Thêm quy tắc' }),
      ).toBeDisabled();
      expect(
        screen.getByRole('button', { name: 'Lưu chính sách' }),
      ).toBeDisabled();
    },
  );

  it('preserves an unavailable existing template and blocks saving until replacement', () => {
    useEmailTemplates.mockReturnValue({
      data: [template],
      isPending: false,
      isError: false,
    });

    render(
      <PolicyDialog
        policy={{
          id: 'policy-1',
          customerGroup: 'REGULAR',
          isActive: true,
          escalationThresholdDays: null,
          rules: [
            {
              id: 'rule-1',
              offsetDays: 1,
              emailTemplateId: 'missing-template',
              minIntervalDays: 1,
            },
          ],
          createdAt: '2026-08-21T00:00:00.000Z',
        }}
        open
        onOpenChange={vi.fn()}
      />,
    );

    expect(
      screen.getByRole('combobox', { name: 'Mẫu email 1' }),
    ).toHaveTextContent('Mẫu không còn khả dụng');
    expect(
      screen.getByRole('button', { name: 'Lưu chính sách' }),
    ).toBeDisabled();
  });
});
