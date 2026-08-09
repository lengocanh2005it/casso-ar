import { type FormEvent, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { apiRequest } from '@/lib/api-client';

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);

    try {
      await apiRequest({
        url: '/api/v1/auth/forgot-password',
        method: 'POST',
        data: { email },
      });
      setSent(true);
    } catch {
      toast.error('Đã xảy ra lỗi. Vui lòng thử lại sau.');
    } finally {
      setSubmitting(false);
    }
  }

  if (sent) {
    return (
      <div className="flex min-h-svh items-center justify-center p-6 text-center">
        <div className="space-y-2">
          <h1 className="text-xl font-semibold">Kiểm tra email</h1>
          <p className="text-sm text-muted-foreground">
            Nếu email tồn tại, bạn sẽ nhận được liên kết đặt lại mật khẩu.
          </p>
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
          <h1 className="text-2xl font-semibold">Quên mật khẩu?</h1>
          <p className="text-sm text-muted-foreground">
            Nhập email để nhận liên kết đặt lại mật khẩu.
          </p>
        </div>

        <label className="block space-y-1">
          <span className="text-sm font-medium">Email</span>
          <input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="h-10 w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </label>

        <Button type="submit" disabled={submitting} className="w-full">
          {submitting ? 'Đang gửi…' : 'Gửi liên kết'}
        </Button>

        <Link
          to="/login"
          className="block text-sm text-primary hover:underline"
        >
          ← Quay lại đăng nhập
        </Link>
      </form>
    </div>
  );
}
