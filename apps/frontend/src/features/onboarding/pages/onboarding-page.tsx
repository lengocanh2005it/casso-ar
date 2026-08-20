import { Permission } from '@casso-ledger/shared-types';
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { useAuth } from '@/contexts/auth-context';
import { AuthLogoLink } from '@/features/auth/components/auth-logo-link';
import {
  useConfirmCassoFlow,
  usePreviewCassoFlowAccounts,
} from '@/features/bank-connections/api/use-bank-connections';
import { CassoFlowAccountPicker } from '@/features/bank-connections/components/casso-flow-account-picker';
import { hasPermission } from '@/lib/rbac';

export function OnboardingPage() {
  const { user, refreshUser, logout } = useAuth();
  const navigate = useNavigate();
  const canManageConnections = hasPermission(
    user?.role,
    Permission.BANK_CONNECTION_MANAGE,
  );
  const previewMutation = usePreviewCassoFlowAccounts();
  const confirmMutation = useConfirmCassoFlow();

  useEffect(() => {
    if (user?.bankingLinked) {
      navigate('/dashboard', { replace: true });
      return;
    }

    const intervalId = window.setInterval(() => {
      void refreshUser().catch(() => undefined);
    }, 5_000);

    return () => window.clearInterval(intervalId);
  }, [navigate, refreshUser, user?.bankingLinked]);

  if (user?.bankingLinked) return null;

  function handleCompleted() {
    void refreshUser()
      .then(() => navigate('/dashboard'))
      .catch(() => undefined);
  }

  return (
    <main className="flex min-h-svh items-center justify-center bg-muted/30 px-4 py-8">
      <Card className="w-full max-w-lg shadow-lg">
        <CardHeader>
          <div className="mb-2">
            <AuthLogoLink />
          </div>
          <p className="text-sm font-medium uppercase tracking-[0.18em] text-primary">
            BƯỚC ĐẦU TIÊN
          </p>
          <CardTitle className="text-2xl">Liên kết ngân hàng</CardTitle>
          <CardDescription>
            Liên kết một tài khoản ngân hàng qua{' '}
            <span className="text-primary">Casso Flow</span> để bắt đầu đồng bộ
            giao dịch phát sinh mới vào{' '}
            <span className="text-primary">Casso Ledger</span>.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {canManageConnections ? (
            <CassoFlowAccountPicker
              onPreview={(apiKey) => previewMutation.mutateAsync({ apiKey })}
              onConfirm={(apiKey, selectedAccountNumbers) =>
                confirmMutation.mutateAsync({ apiKey, selectedAccountNumbers })
              }
              onCompleted={handleCompleted}
            />
          ) : (
            <div
              className="space-y-2 text-sm text-muted-foreground"
              role="status"
            >
              <p>
                Owner hoặc Finance Manager cần liên kết ngân hàng cho tổ chức
                này.
              </p>
              <p>Trang sẽ tự động cập nhật sau khi hoàn tất.</p>
            </div>
          )}
          <Button
            type="button"
            variant="link"
            className="h-auto p-0 text-sm"
            onClick={() => void logout()}
          >
            Đăng xuất
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
