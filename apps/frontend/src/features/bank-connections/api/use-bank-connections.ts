import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  connectCasId,
  disconnectConnection,
  exchangeCasId,
  fetchBankConnections,
} from './bank-connections-api';

const queryKey = ['bank-connections'];

export function usePollConnections(enabled = true) {
  return useQuery({
    queryKey,
    queryFn: fetchBankConnections,
    refetchInterval: enabled ? 5_000 : false,
    enabled,
  });
}

export function useConnectCasId() {
  return useMutation({ mutationFn: connectCasId });
}

export function useExchangeCasId() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      sessionId,
      publicToken,
    }: {
      sessionId: string;
      publicToken: string;
    }) => exchangeCasId(sessionId, { publicToken }),
    onSuccess: () => {
      toast.success('Đã kết nối ngân hàng.');
      void queryClient.invalidateQueries({ queryKey });
    },
    onError: () => toast.error('Không thể hoàn tất kết nối ngân hàng.'),
  });
}

export function useDisconnectConnection() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: disconnectConnection,
    onSuccess: () => {
      toast.success('Đã ngắt kết nối ngân hàng.');
      void queryClient.invalidateQueries({ queryKey });
    },
    onError: () => toast.error('Không thể ngắt kết nối ngân hàng.'),
  });
}
