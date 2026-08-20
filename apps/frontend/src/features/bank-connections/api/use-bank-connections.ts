import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/auth-context';
import {
  connectCassoFlow,
  disconnectConnection,
  fetchBankConnections,
} from './bank-connections-api';

const queryKey = ['bank-connections'];

export function useBankConnections() {
  return useQuery({
    queryKey,
    queryFn: fetchBankConnections,
  });
}

export function usePollConnections(enabled = true) {
  return useQuery({
    queryKey,
    queryFn: fetchBankConnections,
    refetchInterval: enabled ? 5_000 : false,
    enabled,
  });
}

export function useConnectCassoFlow() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: connectCassoFlow,
    onSuccess: () => {
      toast.success('Đã kết nối tài khoản Casso Flow thành công.');
      void queryClient.invalidateQueries({ queryKey });
    },
    onError: () => {
      toast.error(
        'Không thể kết nối Casso Flow. Vui lòng kiểm tra lại API Key.',
      );
    },
  });
}

export function useDisconnectConnection() {
  const queryClient = useQueryClient();
  const { refreshUser } = useAuth();
  return useMutation({
    mutationFn: disconnectConnection,
    onSuccess: () => {
      toast.success('Đã ngắt kết nối ngân hàng.');
      void queryClient.invalidateQueries({ queryKey });
      void refreshUser();
    },
    onError: () => toast.error('Không thể ngắt kết nối ngân hàng.'),
  });
}
