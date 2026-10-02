import { type FormEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { InlineFormError } from '@/components/ui/inline-form-error';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Spinner } from '@/components/ui/spinner';
import { useAuth } from '@/contexts/auth-context';
import { getApiErrorCode, getApiErrorMessage } from '@/lib/api-client';
import { AuthStatusCard } from '../components/auth-status-card';

const ORGANIZATION_STATUS_ERROR_CODES = new Set([
  'ORGANIZATION_PENDING_REVIEW',
  'ORGANIZATION_REJECTED',
]);

// Only a credentials rejection may blame the password; a throttled or failed
// request used to say "wrong password" and sent users to reset it.
function loginErrorMessage(errorCode: string | undefined): string {
  if (errorCode === 'UNAUTHORIZED' || errorCode === 'VALIDATION_ERROR') {
    return 'Email hoặc mật khẩu không đúng.';
  }
  if (errorCode === 'RATE_LIMIT_EXCEEDED') {
    return 'Bạn đã thử đăng nhập quá nhiều lần. Vui lòng đợi vài phút rồi thử lại.';
  }
  return 'Không thể đăng nhập lúc này. Kiểm tra kết nối mạng rồi thử lại.';
}

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
      if (errorCode === 'EMAIL_NOT_VERIFIED') {
        navigate(`/verify-email?email=${encodeURIComponent(email.trim())}`);
        return;
      }
      if (errorCode && ORGANIZATION_STATUS_ERROR_CODES.has(errorCode)) {
        toast.error(
          getApiErrorMessage(submitError) ??
            'Tổ chức của bạn hiện không thể sử dụng dịch vụ.',
        );
      } else {
        setError(loginErrorMessage(errorCode));
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthStatusCard>
      <form onSubmit={onSubmit} className="space-y-5 text-left">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">Đăng nhập</h1>
          <p className="text-sm text-muted-foreground">
            Quản lý công nợ và dòng tiền của doanh nghiệp.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            name="email"
            required
            autoComplete="email"
            spellCheck={false}
            placeholder="ban@congty.com"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="password">Mật khẩu</Label>
          <Input
            id="password"
            type="password"
            name="password"
            required
            autoComplete="current-password"
            placeholder="Nhập mật khẩu"
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
    </AuthStatusCard>
  );
}
