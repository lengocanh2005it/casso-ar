import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ReminderPolicy } from '../types';
import { PolicyTable } from './policy-table';

const { mutate, useAuth } = vi.hoisted(() => ({
  mutate: vi.fn(),
  useAuth: vi.fn(),
}));

vi.mock('@/contexts/auth-context', () => ({ useAuth }));
vi.mock('../api/use-reminders', () => ({
  useUpdateReminderPolicy: () => ({ mutate, isPending: false }),
}));

const policy: ReminderPolicy = {
  id: 'policy-1',
  customerGroup: 'VIP',
  isActive: true,
  escalationThresholdDays: 30,
  rules: [
    {
      id: 'rule-1',
      offsetDays: -3,
      emailTemplateId: 'template-1',
      minIntervalDays: 1,
    },
  ],
  createdAt: '2026-08-10T00:00:00Z',
};

describe('PolicyTable', () => {
  it('renders the regular customer group in Vietnamese', () => {
    useAuth.mockReturnValue({ user: { role: 'OWNER' } });

    render(
      <PolicyTable policies={[{ ...policy, customerGroup: 'REGULAR' }]} />,
    );

    expect(screen.getByText('Thông thường')).toBeInTheDocument();
    expect(screen.queryByText('REGULAR')).not.toBeInTheDocument();
  });

  it('updates a policy with its full rule payload when toggled', () => {
    useAuth.mockReturnValue({ user: { role: 'OWNER' } });

    render(<PolicyTable policies={[policy]} />);

    expect(screen.getByText('Đang hoạt động')).toBeTruthy();

    fireEvent.click(screen.getByRole('switch', { name: /VIP/i }));

    expect(mutate).toHaveBeenCalledWith({
      id: 'policy-1',
      input: {
        customerGroup: 'VIP',
        isActive: false,
        escalationThresholdDays: 30,
        rules: policy.rules,
      },
    });
  });
});
