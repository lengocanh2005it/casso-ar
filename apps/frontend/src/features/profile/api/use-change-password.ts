import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { apiRequest } from '@/lib/api-client';

export function useRequestChangePasswordOtp() {
  return useMutation({
    mutationFn: async (currentPassword: string) => {
      await apiRequest<unknown>({
        url: '/api/v1/auth/change-password/request',
        method: 'POST',
        data: { currentPassword },
      });
    },
    onSuccess: () => {
      toast.success('OTP đã gửi đến email của bạn');
    },
    onError: () => {
      toast.error('Mật khẩu hiện tại không đúng');
    },
  });
}

export function useConfirmChangePassword() {
  return useMutation({
    mutationFn: async ({
      otp,
      newPassword,
    }: {
      otp: string;
      newPassword: string;
    }) => {
      await apiRequest<unknown>({
        url: '/api/v1/auth/change-password/confirm',
        method: 'POST',
        data: { otp, newPassword },
      });
    },
    onSuccess: () => {
      toast.success('Đã đổi mật khẩu');
    },
    onError: () => {
      toast.error('OTP không hợp lệ hoặc đã hết hạn');
    },
  });
}
