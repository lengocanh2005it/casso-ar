import { type FormEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { InlineFormError } from '@/components/ui/inline-form-error';
import { Spinner } from '@/components/ui/spinner';
import { useAuth } from '@/contexts/auth-context';
import { apiRequest, authTokenManager } from '@/lib/api-client';

export function SignupPage() {
  const { refreshUser } = useAuth();
  const navigate = useNavigate();
  const [organizationName, setOrganizationName] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      authTokenManager.resetLogoutState();
      const result = await apiRequest<{ accessToken: string }>({
        url: '/api/v1/auth/signup',
        method: 'POST',
        data: { organizationName, name, email, password },
      });
      authTokenManager.setAccessToken(result.accessToken);
      await refreshUser();
      toast.success('Tạo tài khoản thành công.');
      navigate('/dashboard');
    } catch {
      setError('Không thể tạo tài khoản. Vui lòng kiểm tra thông tin.');
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
        <div className="space-y-1">
          <p className="text-sm font-medium text-primary">Casso Ledger</p>
          <h1 className="text-2xl font-semibold">Tạo tài khoản</h1>
          <p className="text-sm text-muted-foreground">
            Bắt đầu quản lý công nợ cho doanh nghiệp của bạn.
          </p>
        </div>

        <label className="block space-y-1">
          <span className="text-sm font-medium">Tên tổ chức</span>
          <input
            name="organizationName"
            required
            autoComplete="organization"
            value={organizationName}
            onChange={(event) => setOrganizationName(event.target.value)}
            className="h-10 w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </label>

        <label className="block space-y-1">
          <span className="text-sm font-medium">Họ và tên</span>
          <input
            name="name"
            required
            autoComplete="name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="h-10 w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </label>

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

        <label className="block space-y-1">
          <span className="text-sm font-medium">Mật khẩu</span>
          <input
            type="password"
            name="password"
            required
            minLength={8}
            autoComplete="new-password"
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
          {submitting ? 'Đang xử lý…' : 'Tạo tài khoản'}
        </Button>

        <p className="text-sm">
          Đã có tài khoản?{' '}
          <Link
            to="/login"
            className="text-primary pointer-hover:hover:underline"
          >
            Đăng nhập
          </Link>
        </p>
      </form>
    </div>
  );
}
