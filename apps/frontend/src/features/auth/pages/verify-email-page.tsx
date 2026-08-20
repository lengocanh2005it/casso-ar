import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/auth-context';
import { authTokenManager } from '@/lib/api-client';
import { AuthLogoLink } from '../components/auth-logo-link';
import { AuthStatusCard } from '../components/auth-status-card';
import { EmailOtpStep } from '../components/email-otp-step';

export function VerifyEmailPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { refreshUser } = useAuth();
  const email = searchParams.get('email') ?? '';

  async function onVerified(result: { accessToken: string }) {
    authTokenManager.setAccessToken(result.accessToken);
    await refreshUser();
    navigate('/onboarding', { replace: true });
  }

  if (!email) {
    return (
      <AuthStatusCard>
        <div role="alert" className="space-y-2">
          <h1 className="text-xl font-semibold">Thiếu thông tin email</h1>
          <p className="text-sm text-muted-foreground">
            Vui lòng đăng ký hoặc đăng nhập lại để nhận mã xác thực mới.
          </p>
          <Link
            to="/login"
            className="text-primary pointer-hover:hover:underline"
          >
            Đến trang đăng nhập
          </Link>
        </div>
      </AuthStatusCard>
    );
  }

  return (
    <div className="flex min-h-svh items-center justify-center bg-muted/30 p-6">
      <div className="w-full max-w-sm space-y-4 rounded-xl border bg-card p-6 shadow-sm">
        <AuthLogoLink />
        <h1 className="text-xl font-semibold">Xác thực email</h1>
        <EmailOtpStep email={email} onVerified={onVerified} />
        <Button variant="link" className="h-auto p-0 text-sm" asChild>
          <Link to="/login">← Quay lại đăng nhập</Link>
        </Button>
      </div>
    </div>
  );
}
