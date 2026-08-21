import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/auth-context';
import { getApiErrorCode } from '@/lib/api-client';
import {
  confirmCassoFlow,
  disconnectConnection,
  fetchAuthorizationAuditEvents,
  fetchBankConnections,
  previewCassoFlowAccounts,
  previewCassoFlowAuthorizationRotation,
  revealCassoFlowApiKey,
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
  return useMutation({
    mutationFn: ({
      authorizationId,
      apiKey,
    }: {
      authorizationId: string;
      apiKey: string;
    }) => previewCassoFlowAuthorizationRotation(authorizationId, { apiKey }),
  });
}

export function useRotateCassoFlowAuthorization() {
  const queryClient = useQueryClient();
  const { refreshUser } = useAuth();
  return useMutation({
    mutationFn: ({
      authorizationId,
      apiKey,
    }: {
      authorizationId: string;
      apiKey: string;
    }) => rotateCassoFlowAuthorization(authorizationId, { apiKey }),
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

export function useRevealCassoFlowApiKey() {
  return useMutation({
    mutationFn: ({
      authorizationId,
      password,
    }: {
      authorizationId: string;
      password: string;
    }) => revealCassoFlowApiKey(authorizationId, { password }),
    onError: (error) => {
      if (getApiErrorCode(error) === 'UNAUTHORIZED') {
        toast.error('Mật khẩu không đúng.');
        return;
      }
      toast.error('Không thể hiện API Key.');
    },
  });
}

export function useAuthorizationAuditEvents(
  authorizationId: string,
  enabled: boolean,
  page = 1,
) {
  return useQuery({
    queryKey: ['bank-connections', 'audit-events', authorizationId, page],
    queryFn: () => fetchAuthorizationAuditEvents(authorizationId, page),
    enabled,
  });
}
