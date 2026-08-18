import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { apiRequest } from '@/lib/api-client';
import { AuthLogoLink } from '../components/auth-logo-link';

type VerificationState = 'verifying' | 'success' | 'error';

export function VerifyEmailPage() {
  const [searchParams] = useSearchParams();
  const [state, setState] = useState<VerificationState>('verifying');

  useEffect(() => {
    const token = searchParams.get('token');
    if (!token) {
      setState('error');
      return;
    }

    void apiRequest({
      url: '/api/v1/auth/verify-email',
      method: 'POST',
      data: { token },
    })
      .then(() => setState('success'))
      .catch(() => setState('error'));
  }, [searchParams]);

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

  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-6 p-6 text-center">
      <AuthLogoLink />
      <div role="status" className="space-y-2">
        <h1 className="text-xl font-semibold">Email đã được xác minh</h1>
        <p className="text-sm text-muted-foreground">
          Bạn có thể đăng nhập để tiếp tục.
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
