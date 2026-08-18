import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/contexts/auth-context';
import { apiRequest, authTokenManager } from '@/lib/api-client';
import { AuthLogoLink } from '../components/auth-logo-link';

type VerificationState = 'pending' | 'verifying' | 'error';

export function VerifyEmailPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { refreshUser } = useAuth();
  const token = searchParams.get('token');
  const [state, setState] = useState<VerificationState>(
    token ? 'verifying' : 'pending',
  );

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
