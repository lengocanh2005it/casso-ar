import { type FormEvent, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Logo } from '@/components/logo';
import { Button } from '@/components/ui/button';
import { InlineFormError } from '@/components/ui/inline-form-error';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Spinner } from '@/components/ui/spinner';
import { adminLogin } from '../api/admin-api';

function initialErrorFromRedirect(state: unknown): string | null {
  const reason = (state as { reason?: string } | null)?.reason;
  return reason === 'not-operator'
    ? 'Tài khoản này không có quyền truy cập Casso Admin.'
    : null;
}

export function AdminLoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(() =>
    initialErrorFromRedirect(location.state),
  );
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      await adminLogin(email, password);
      navigate('/admin/dashboard', { replace: true });
    } catch {
      setError('Đăng nhập thất bại. Kiểm tra thông tin và thử lại.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <>
      <a
        href="#admin-login-content"
        className="sr-only focus-visible:not-sr-only focus-visible:absolute focus-visible:top-2 focus-visible:left-2 focus-visible:z-50 focus-visible:rounded-md focus-visible:bg-background focus-visible:px-4 focus-visible:py-2 focus-visible:text-sm focus-visible:shadow-md"
      >
        Đi tới nội dung
      </a>
      <main
        id="admin-login-content"
        className="flex min-h-svh items-center justify-center bg-gradient-to-br from-emerald-50 via-background to-teal-50 p-4 dark:from-emerald-950/20 dark:via-background dark:to-teal-950/20 sm:p-6"
      >
        <div className="w-full max-w-sm space-y-5 rounded-xl border-primary/10 bg-card/95 p-6 text-center shadow-lg shadow-primary/5 backdrop-blur sm:p-7">
          <div className="space-y-1">
            <Logo className="h-7" wordmarkClassName="text-primary" />
            <p className="text-sm text-muted-foreground">
              Trang đăng nhập dành cho quản trị viên.
            </p>
          </div>
          <form onSubmit={handleSubmit} className="space-y-4 text-left">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                className="h-11"
                id="email"
                name="email"
                autoComplete="email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Mật khẩu</Label>
              <Input
                className="h-11"
                id="password"
                name="password"
                autoComplete="current-password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
            </div>
            <InlineFormError message={error} />
            <Button
              type="submit"
              className="h-11 w-full"
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <>
                  <Spinner className="size-4" />
                  Đang đăng nhập…
                </>
              ) : (
                'Đăng nhập'
              )}
            </Button>
          </form>
        </div>
      </main>
    </>
  );
}
