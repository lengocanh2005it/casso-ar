import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ProfileDialog } from './profile-dialog';

const { useAuth, updateMutateAsync, uploadMutateAsync } = vi.hoisted(() => ({
  useAuth: vi.fn(),
  updateMutateAsync: vi.fn(),
  uploadMutateAsync: vi.fn(),
}));

vi.mock('@/contexts/auth-context', () => ({ useAuth }));
vi.mock('@/features/profile/api/use-update-profile', () => ({
  useUpdateProfile: () => ({
    isPending: false,
    mutateAsync: updateMutateAsync,
  }),
}));
vi.mock('@/features/profile/api/use-upload-avatar', () => ({
  useUploadAvatar: () => ({
    isPending: false,
    mutateAsync: uploadMutateAsync,
  }),
}));
vi.mock('@/features/profile/components/change-password-form', () => ({
  ChangePasswordForm: () => null,
}));
vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
}));
vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

describe('ProfileDialog', () => {
  beforeEach(() => {
    updateMutateAsync.mockReset().mockResolvedValue(undefined);
    uploadMutateAsync.mockReset().mockResolvedValue(undefined);
    useAuth.mockReturnValue({
      user: {
        id: 'user-1',
        email: 'owner@congtyb.vn',
        name: 'Nguyễn Văn A',
        avatarUrl: null,
        role: 'OWNER',
        organizationId: 'org-1',
        organizationName: 'Công ty B',
        subscriptionPlan: 'BUSINESS',
        bankingLinked: false,
      },
      logout: vi.fn(),
    });
  });

  it('saves an edited profile for an authenticated user', async () => {
    render(<ProfileDialog open onOpenChange={vi.fn()} />);

    fireEvent.change(screen.getByLabelText('Họ và tên'), {
      target: { value: 'Nguyễn Văn B' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Lưu thay đổi' }));

    await waitFor(() => {
      expect(updateMutateAsync).toHaveBeenCalledWith({
        name: 'Nguyễn Văn B',
        organizationName: 'Công ty B',
      });
    });
  });

  it('shows the subscription tier in Vietnamese', () => {
    render(<ProfileDialog open onOpenChange={vi.fn()} />);

    expect(screen.getByText('Chuyên nghiệp')).toBeInTheDocument();
    expect(screen.queryByText('BUSINESS')).not.toBeInTheDocument();
  });
});
