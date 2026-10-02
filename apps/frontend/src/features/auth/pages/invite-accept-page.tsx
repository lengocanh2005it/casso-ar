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
      <AuthStatusCard>
        <div role="status" className="space-y-2">
          <h1 className="text-xl font-semibold">Tham gia tổ chức thành công</h1>
          <p className="text-sm text-muted-foreground">
            Bạn có thể đăng nhập để bắt đầu sử dụng{' '}
            <span className="text-primary">Casso AR</span>.
          </p>
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
          <h1 className="text-2xl font-semibold">Nhận lời mời</h1>
          <p className="text-sm text-muted-foreground">
            Tạo thông tin đăng nhập để tham gia tổ chức.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="name">Họ và tên</Label>
          <Input
            id="name"
            name="name"
            required
            autoComplete="name"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="password">Mật khẩu</Label>
          <Input
            id="password"
            type="password"
            name="password"
            required
            minLength={8}
            autoComplete="new-password"
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
          {submitting ? 'Đang xử lý…' : 'Tham gia'}
        </Button>
      </form>
    </AuthStatusCard>
  );
}
