import { type FormEvent, useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { InlineFormError } from '@/components/ui/inline-form-error';
import { Spinner } from '@/components/ui/spinner';
import { useAuth } from '@/contexts/auth-context';
import { apiRequest, authTokenManager } from '@/lib/api-client';
import { AuthLogoLink } from '../components/auth-logo-link';

type VerificationState = 'pending' | 'verifying' | 'error';

export function VerifyEmailPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { refreshUser } = useAuth();
  const token = searchParams.get('token');
  const [email, setEmail] = useState(searchParams.get('email') ?? '');
  const [resending, setResending] = useState(false);
  const [resendSent, setResendSent] = useState(false);
  const [resendError, setResendError] = useState<string | null>(null);
  const [state, setState] = useState<VerificationState>(
    token ? 'verifying' : 'pending',
  );

  async function onResend(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setResending(true);
    setResendSent(false);
    setResendError(null);

    try {
      await apiRequest({
        url: '/api/v1/auth/resend-verification',
        method: 'POST',
        data: { email },
      });
      setResendSent(true);
    } catch {
      setResendError('Không thể gửi lại email. Vui lòng thử lại sau.');
    } finally {
      setResending(false);
    }
  }

  useEffect(() => {
    if (!token) {
      setState('pending');
      return;
    }

    let cancelled = false;
    void apiRequest<{ accessToken: string }>({
      url: '/api/v1/auth/verify-email',
      method: 'POST',
      data: { token },
    })
      .then(async (result) => {
        authTokenManager.setAccessToken(result.accessToken);
        await refreshUser();
        if (!cancelled) navigate('/onboarding', { replace: true });
      })
      .catch(() => {
        if (!cancelled) setState('error');
      });

    return () => {
      cancelled = true;
    };
  }, [navigate, refreshUser, token]);

  if (state === 'pending') {
    return (
      <div className="flex min-h-svh flex-col items-center justify-center gap-6 p-6 text-center">
        <AuthLogoLink />
        <div role="status" className="space-y-2">
          <h1 className="text-xl font-semibold">Kiểm tra email</h1>
          <p className="text-sm text-muted-foreground">
            Mở liên kết trong email để xác minh tài khoản và tiếp tục thiết lập.
          </p>
          <form onSubmit={onResend} className="space-y-2 text-left">
            <label className="block space-y-1">
              <span className="text-sm font-medium">Email</span>
              <input
                type="email"
                name="email"
                required
                autoComplete="email"
                spellCheck={false}
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="h-10 w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </label>
            <InlineFormError message={resendError} />
            {resendSent && (
              <p className="text-sm text-muted-foreground" role="status">
                Đã gửi lại email xác thực. Hãy kiểm tra hộp thư của bạn.
              </p>
            )}
            <Button
              type="submit"
              disabled={resending}
              aria-busy={resending}
              className="w-full"
            >
              {resending && <Spinner />}
              {resending ? 'Đang gửi…' : 'Gửi lại email xác thực'}
            </Button>
          </form>
          <Link
            to="/login"
            className="text-primary pointer-hover:hover:underline"
          >
            Quay lại đăng nhập
          </Link>
        </div>
      </div>
    );
  }

  if (state === 'verifying') {
    return (
      <div className="flex min-h-svh flex-col items-center justify-center gap-6 p-6 text-center">
        <AuthLogoLink />
        <div role="status">Đang xác minh email…</div>
      </div>
    );
  }

  if (state === 'error') {
    return (
      <div className="flex min-h-svh flex-col items-center justify-center gap-6 p-6 text-center">
        <AuthLogoLink />
        <div role="status" className="space-y-2">
          <h1 className="text-xl font-semibold">Liên kết không hợp lệ</h1>
          <p className="text-sm text-muted-foreground">
            Liên kết xác minh đã hết hạn hoặc không tồn tại.
          </p>
          <Link
            to="/login"
            className="text-primary pointer-hover:hover:underline"
          >
            Đến trang đăng nhập
          </Link>
        </div>
      </div>
    );
  }

  return null;
}
