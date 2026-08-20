import { Permission } from '@casso-ledger/shared-types';
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { useAuth } from '@/contexts/auth-context';
import { CassoFlowConnectForm } from '@/features/bank-connections/components/casso-flow-connect-form';
import { hasPermission } from '@/lib/rbac';

export function OnboardingPage() {
  const { user, refreshUser } = useAuth();
  const navigate = useNavigate();
  const canManageConnections = hasPermission(
    user?.role,
    Permission.BANK_CONNECTION_MANAGE,
  );

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
          <p className="text-sm font-medium uppercase tracking-[0.18em] text-primary">
            BƯỚC ĐẦU TIÊN
          </p>
          <CardTitle className="text-2xl">Liên kết ngân hàng</CardTitle>
          <CardDescription>
            Liên kết một tài khoản ngân hàng qua Casso Flow để bắt đầu đồng bộ
            giao dịch phát sinh mới vào Casso Ledger.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {canManageConnections ? (
            <CassoFlowConnectForm onCompleted={handleCompleted} />
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
        </CardContent>
      </Card>
    </main>
  );
}
