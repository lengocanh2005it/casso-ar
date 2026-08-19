import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/auth-context';
import { apiRequest } from '@/lib/api-client';

interface UpdateProfileInput {
  name?: string;
  organizationName?: string;
}

export function useUpdateProfile() {
  const queryClient = useQueryClient();
  const { refreshUser } = useAuth();

  return useMutation({
    mutationFn: async (input: UpdateProfileInput) => {
      return apiRequest<unknown>({
        url: '/api/v1/auth/me',
        method: 'PATCH',
        data: input,
      });
    },
    onSuccess: async () => {
      await refreshUser();
      queryClient.invalidateQueries({ queryKey: ['profile'] });
      toast.success('Đã cập nhật hồ sơ');
    },
    onError: () => {
      toast.error('Không thể cập nhật hồ sơ');
    },
  });
}
