import { type FormEvent, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { InlineFormError } from '@/components/ui/inline-form-error';
import { apiRequest } from '@/lib/api-client';

export function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const [password, setPassword] = useState('');
  const [done, setDone] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const token = searchParams.get('token');
    if (!token) {
      setError('Liên kết đặt lại mật khẩu không hợp lệ.');
      return;
    }

    setSubmitting(true);
    try {
      await apiRequest({
        url: '/api/v1/auth/reset-password',
        method: 'POST',
        data: { token, newPassword: password },
      });
      setDone(true);
      toast.success('Đặt lại mật khẩu thành công.');
    } catch {
      setError('Liên kết đã hết hạn hoặc không hợp lệ.');
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <div className="flex min-h-svh items-center justify-center p-6 text-center">
        <div role="status" className="space-y-2">
          <h1 className="text-xl font-semibold">Mật khẩu đã được đặt lại</h1>
          <Link to="/login" className="text-primary hover:underline">
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
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">Đặt lại mật khẩu</h1>
          <p className="text-sm text-muted-foreground">
            Mật khẩu mới cần có ít nhất 8 ký tự.
          </p>
        </div>

        <label className="block space-y-1">
          <span className="text-sm font-medium">Mật khẩu mới</span>
          <input
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="h-10 w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </label>

        <InlineFormError message={error} />

        <Button type="submit" disabled={submitting} className="w-full">
          {submitting ? 'Đang xử lý…' : 'Đặt lại mật khẩu'}
        </Button>
      </form>
    </div>
  );
}
