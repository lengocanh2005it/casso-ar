import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/contexts/auth-context';
import { authTokenManager } from '@/lib/api-client';
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
    <AuthStatusCard>
      <div className="space-y-5 text-left">
        <EmailOtpStep email={email} onVerified={onVerified} />
      </div>
    </AuthStatusCard>
  );
}
