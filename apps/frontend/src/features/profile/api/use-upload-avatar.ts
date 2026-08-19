import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/auth-context';
import { apiRequest } from '@/lib/api-client';

export function useUploadAvatar() {
  const queryClient = useQueryClient();
  const { refreshUser } = useAuth();

  return useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      return apiRequest<{ avatarUrl: string }>({
        url: '/api/v1/profile/avatar',
        method: 'POST',
        data: formData,
        headers: { 'Content-Type': 'multipart/form-data' },
      });
    },
    onSuccess: async () => {
      await refreshUser();
      queryClient.invalidateQueries({ queryKey: ['profile'] });
      toast.success('Đã cập nhật ảnh đại diện');
    },
    onError: () => {
      toast.error('Không thể tải ảnh lên');
    },
  });
}
