import { type FormEvent, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { InlineFormError } from '@/components/ui/inline-form-error';
import { Spinner } from '@/components/ui/spinner';
import { apiRequest } from '@/lib/api-client';

export function InviteAcceptPage() {
  const [searchParams] = useSearchParams();
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [done, setDone] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const token = searchParams.get('token');
    if (!token) {
      setError('Liên kết lời mời không hợp lệ.');
      return;
    }

    setSubmitting(true);
    try {
      await apiRequest({
        url: '/api/v1/invites/accept',
        method: 'POST',
        data: { token, name, password },
      });
      setDone(true);
      toast.success('Tham gia tổ chức thành công.');
    } catch {
      setError('Lời mời đã hết hạn hoặc không hợp lệ.');
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <div className="flex min-h-svh items-center justify-center p-6 text-center">
        <div role="status" className="space-y-2">
          <h1 className="text-xl font-semibold">Tham gia tổ chức thành công</h1>
          <p className="text-sm text-muted-foreground">
            Bạn có thể đăng nhập để bắt đầu sử dụng Casso Ledger.
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
          <h1 className="text-2xl font-semibold">Nhận lời mời</h1>
          <p className="text-sm text-muted-foreground">
            Tạo thông tin đăng nhập để tham gia tổ chức.
          </p>
        </div>

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
          {submitting ? 'Đang xử lý…' : 'Tham gia'}
        </Button>
      </form>
    </div>
  );
}
