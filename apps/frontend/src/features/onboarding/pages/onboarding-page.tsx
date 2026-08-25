import { Permission } from '@casso-ar/shared-types';
import { ShieldCheck } from 'lucide-react';
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

function ManagedCassoFlowPicker({ onCompleted }: { onCompleted: () => void }) {
  const previewMutation = usePreviewCassoFlowAccounts();
  const confirmMutation = useConfirmCassoFlow();

  return (
    <CassoFlowAccountPicker
      onPreview={(apiKey) => previewMutation.mutateAsync({ apiKey })}
      onConfirm={(apiKey, selectedAccountNumbers) =>
        confirmMutation.mutateAsync({ apiKey, selectedAccountNumbers })
      }
      onCompleted={onCompleted}
    />
  );
}

export function OnboardingPage() {
  const { user, refreshUser, logout } = useAuth();
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
    <main className="flex min-h-svh items-center justify-center bg-gradient-to-br from-emerald-50 via-background to-teal-50 px-4 py-8 dark:from-emerald-950/20 dark:via-background dark:to-teal-950/20">
      <Card className="w-full max-w-lg border-primary/10 bg-card/95 shadow-xl shadow-primary/5 backdrop-blur">
        <CardHeader className="gap-3">
          <div className="mb-1">
            <AuthLogoLink />
          </div>
          <div className="flex items-center gap-2 text-sm font-medium text-emerald-700 dark:text-emerald-400">
            <span className="flex size-7 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-950/60">
              <ShieldCheck aria-hidden="true" className="size-4" />
            </span>
            Kết nối an toàn
          </div>
          <CardTitle className="text-2xl">Liên kết ngân hàng</CardTitle>
          <CardDescription>
            Liên kết một tài khoản ngân hàng qua{' '}
            <span className="text-primary">Casso Flow</span> để bắt đầu đồng bộ
            giao dịch phát sinh mới vào{' '}
            <span className="text-primary">Casso AR</span>.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="rounded-xl border border-emerald-100 bg-emerald-50/70 p-3 text-sm text-emerald-950 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-100">
            Casso Flow chỉ đồng bộ giao dịch mới để bạn theo dõi dòng tiền.
          </div>
          {canManageConnections ? (
            <ManagedCassoFlowPicker onCompleted={handleCompleted} />
          ) : (
            <div
              className="space-y-2 rounded-xl border bg-muted/30 p-4 text-sm text-muted-foreground"
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
