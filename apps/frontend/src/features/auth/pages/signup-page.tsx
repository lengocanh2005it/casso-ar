import { type FormEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { InlineFormError } from '@/components/ui/inline-form-error';
import { Spinner } from '@/components/ui/spinner';
import { useAuth } from '@/contexts/auth-context';
import { apiRequest, authTokenManager } from '@/lib/api-client';
import { AuthLogoLink } from '../components/auth-logo-link';
import { EmailOtpStep } from '../components/email-otp-step';

const TAX_CODE_PATTERN = /^\d{10}(\d{3})?$/;

export function SignupPage() {
  const navigate = useNavigate();
  const { refreshUser } = useAuth();
  const [step, setStep] = useState<'form' | 'otp'>('form');
  const [organizationName, setOrganizationName] = useState('');
  const [taxCode, setTaxCode] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!TAX_CODE_PATTERN.test(taxCode.trim())) {
      setError('Mã số thuế phải gồm 10 hoặc 13 chữ số.');
      return;
    }

    setSubmitting(true);
    try {
      authTokenManager.resetLogoutState();
      await apiRequest({
        url: '/api/v1/auth/signup',
        method: 'POST',
        data: { organizationName, name, email, password, taxCode },
      });
      toast.success('Tạo tài khoản thành công.');
      setStep('otp');
    } catch {
      setError('Không thể tạo tài khoản. Vui lòng kiểm tra thông tin.');
    } finally {
      setSubmitting(false);
    }
  }

  async function onVerified(result: { accessToken: string }) {
    authTokenManager.setAccessToken(result.accessToken);
    await refreshUser();
    navigate('/onboarding', { replace: true });
  }

  if (step === 'otp') {
    return (
      <div className="flex min-h-svh flex-col items-center justify-center gap-6 p-6">
        <AuthLogoLink />
        <div className="w-full max-w-sm rounded-xl border bg-card p-6 shadow-sm">
          <h1 className="mb-4 text-xl font-semibold">Xác thực email</h1>
          <EmailOtpStep email={email} onVerified={onVerified} />
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
            placeholder="VD: Công ty TNHH ABC"
            value={organizationName}
            onChange={(event) => setOrganizationName(event.target.value)}
            className="h-10 w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </label>

        <label className="block space-y-1">
          <span className="text-sm font-medium">Mã số thuế</span>
          <input
            name="taxCode"
            required
            inputMode="numeric"
            maxLength={13}
            placeholder="VD: 0101234567"
            value={taxCode}
            onChange={(event) => setTaxCode(event.target.value)}
            className="h-10 w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </label>

        <label className="block space-y-1">
          <span className="text-sm font-medium">Họ và tên</span>
          <input
            name="name"
            required
            autoComplete="name"
            placeholder="VD: Nguyễn Văn A"
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
            minLength={8}
            autoComplete="new-password"
            placeholder="Ít nhất 8 ký tự"
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
