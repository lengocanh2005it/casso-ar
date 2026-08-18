import { type FormEvent, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { InlineFormError } from '@/components/ui/inline-form-error';
import { Spinner } from '@/components/ui/spinner';
import { apiRequest } from '@/lib/api-client';
import { AuthLogoLink } from '../components/auth-logo-link';

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      await apiRequest({
        url: '/api/v1/auth/forgot-password',
        method: 'POST',
        data: { email },
      });
      setSent(true);
    } catch {
      setError('Đã xảy ra lỗi. Vui lòng thử lại sau.');
    } finally {
      setSubmitting(false);
    }
  }

  if (sent) {
    return (
      <div className="flex min-h-svh flex-col items-center justify-center gap-6 p-6 text-center">
        <AuthLogoLink />
        <div role="status" className="space-y-2">
          <h1 className="text-xl font-semibold">Kiểm tra email</h1>
          <p className="text-sm text-muted-foreground">
            Nếu email tồn tại, bạn sẽ nhận được liên kết đặt lại mật khẩu.
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
    <div className="flex min-h-svh items-center justify-center bg-muted/30 p-6">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-sm space-y-4 rounded-xl border bg-card p-6 shadow-sm"
      >
        <AuthLogoLink />

        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">Quên mật khẩu?</h1>
          <p className="text-sm text-muted-foreground">
            Nhập email để nhận liên kết đặt lại mật khẩu.
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

        <InlineFormError message={error} />

        <Button
          type="submit"
          disabled={submitting}
          aria-busy={submitting}
          className="w-full"
        >
          {submitting && <Spinner />}
          {submitting ? 'Đang gửi…' : 'Gửi liên kết'}
        </Button>

        <Link
          to="/login"
          className="block text-sm text-primary pointer-hover:hover:underline"
        >
          ← Quay lại đăng nhập
        </Link>
      </form>
    </div>
  );
}
