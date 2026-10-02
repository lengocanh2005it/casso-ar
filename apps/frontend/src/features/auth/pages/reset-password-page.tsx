import { type FormEvent, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { InlineFormError } from '@/components/ui/inline-form-error';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Spinner } from '@/components/ui/spinner';
import { apiRequest } from '@/lib/api-client';
import { AuthStatusCard } from '../components/auth-status-card';

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
      <AuthStatusCard>
        <div
          role="status"
          className="animate-fade-up motion-reduce:animate-none space-y-2"
        >
          <h1 className="text-xl font-semibold">Mật khẩu đã được đặt lại</h1>
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
      <form onSubmit={onSubmit} className="space-y-5 text-left">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">Đặt lại mật khẩu</h1>
          <p className="text-sm text-muted-foreground">
            Mật khẩu mới cần có ít nhất 8 ký tự.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="newPassword">Mật khẩu mới</Label>
          <Input
            id="newPassword"
            type="password"
            name="newPassword"
            required
            minLength={8}
            autoComplete="new-password"
            placeholder="Ít nhất 8 ký tự"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </div>

        <InlineFormError message={error} />

        <Button
          type="submit"
          disabled={submitting}
          aria-busy={submitting}
          className="w-full"
        >
          {submitting && <Spinner />}
          {submitting ? 'Đang xử lý…' : 'Đặt lại mật khẩu'}
        </Button>

        <Button variant="link" className="h-auto p-0 text-sm" asChild>
          <Link to="/forgot-password">Yêu cầu liên kết mới</Link>
        </Button>
      </form>
    </AuthStatusCard>
  );
}
