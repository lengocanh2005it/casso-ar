import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/auth-context';
import { getApiErrorCode } from '@/lib/api-client';
import {
  confirmCassoFlow,
  disconnectConnection,
  fetchBankConnections,
  previewCassoFlowAccounts,
  previewCassoFlowAuthorizationRotation,
  rotateCassoFlowAuthorization,
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

export function usePreviewCassoFlowAccounts() {
  return useMutation({ mutationFn: previewCassoFlowAccounts });
}

export function useConfirmCassoFlow() {
  const queryClient = useQueryClient();
  const { refreshUser } = useAuth();
  return useMutation({
    mutationFn: confirmCassoFlow,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey });
      void refreshUser();
    },
    onError: (error) => {
      if (getApiErrorCode(error) === 'PLAN_LIMIT_EXCEEDED') return;
      toast.error(
        'Không thể kết nối Casso Flow. Vui lòng kiểm tra lại API Key.',
      );
    },
  });
}

export function usePreviewCassoFlowAuthorizationRotation() {
  return useMutation({ mutationFn: previewCassoFlowAuthorizationRotation });
}

export function useRotateCassoFlowAuthorization() {
  const queryClient = useQueryClient();
  const { refreshUser } = useAuth();
  return useMutation({
    mutationFn: rotateCassoFlowAuthorization,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey });
      void refreshUser();
    },
    onError: () => toast.error('Không thể đổi API Key Casso Flow.'),
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
