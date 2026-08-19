import { type FormEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { InlineFormError } from '@/components/ui/inline-form-error';
import { Spinner } from '@/components/ui/spinner';
import { useAuth } from '@/contexts/auth-context';
import { getApiErrorCode, getApiErrorMessage } from '@/lib/api-client';
import { AuthLogoLink } from '../components/auth-logo-link';

const ORGANIZATION_STATUS_ERROR_CODES = new Set([
  'ORGANIZATION_PENDING_REVIEW',
  'ORGANIZATION_REJECTED',
]);

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      await login(email, password);
      toast.success('Đăng nhập thành công.');
      navigate('/dashboard');
    } catch (submitError) {
      const errorCode = getApiErrorCode(submitError);
      if (errorCode && ORGANIZATION_STATUS_ERROR_CODES.has(errorCode)) {
        toast.error(
          getApiErrorMessage(submitError) ??
            'Tổ chức của bạn hiện không thể sử dụng dịch vụ.',
        );
      } else {
        setError('Email hoặc mật khẩu không đúng.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-svh items-center justify-center bg-muted/30 p-6">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-sm space-y-4 rounded-xl border bg-card p-6 shadow-sm"
      >
        <AuthLogoLink />

        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">Đăng nhập</h1>
          <p className="text-sm text-muted-foreground">
            Quản lý công nợ và dòng tiền của doanh nghiệp.
          </p>
        </div>

        <label className="block space-y-1">
          <span className="text-sm font-medium">Email</span>
          <input
            type="email"
            name="email"
            required
            autoComplete="email"
            spellCheck={false}
            placeholder="ban@congty.com"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="h-10 w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </label>

        <label className="block space-y-1">
          <span className="text-sm font-medium">Mật khẩu</span>
          <input
            type="password"
            name="password"
            required
            autoComplete="current-password"
            placeholder="Nhập mật khẩu"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="h-10 w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </label>

        <InlineFormError message={error} />

        <Button
          type="submit"
          disabled={submitting}
          aria-busy={submitting}
          className="w-full"
        >
          {submitting && <Spinner />}
          {submitting ? 'Đang xử lý…' : 'Đăng nhập'}
        </Button>

        <div className="flex justify-between text-sm">
          <Link
            to="/signup"
            className="text-primary pointer-hover:hover:underline"
          >
            Tạo tài khoản
          </Link>
          <Link
            to="/forgot-password"
            className="text-primary pointer-hover:hover:underline"
          >
            Quên mật khẩu?
          </Link>
        </div>
      </form>
    </div>
  );
}
