import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { apiRequest } from '@/lib/api-client';

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
      method: 'GET',
      params: { token },
    })
      .then(() => setState('success'))
      .catch(() => setState('error'));
  }, [searchParams]);

  if (state === 'verifying') {
    return <div className="p-6 text-center">Đang xác minh email…</div>;
  }

  if (state === 'error') {
    return (
      <div className="space-y-2 p-6 text-center">
        <h1 className="text-xl font-semibold">Liên kết không hợp lệ</h1>
        <p className="text-sm text-muted-foreground">
          Liên kết xác minh đã hết hạn hoặc không tồn tại.
        </p>
        <Link to="/login" className="text-primary hover:underline">
          Đến trang đăng nhập
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-2 p-6 text-center">
      <h1 className="text-xl font-semibold">Email đã được xác minh</h1>
      <p className="text-sm text-muted-foreground">
        Bạn có thể đăng nhập để tiếp tục.
      </p>
      <Link to="/login" className="text-primary hover:underline">
        Đến trang đăng nhập
      </Link>
    </div>
  );
}
