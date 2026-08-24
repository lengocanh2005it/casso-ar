import { type FormEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { InlineFormError } from '@/components/ui/inline-form-error';
import { Spinner } from '@/components/ui/spinner';
import { useAuth } from '@/contexts/auth-context';
import {
  apiRequest,
  authTokenManager,
  getApiErrorCode,
  getApiErrorMessage,
} from '@/lib/api-client';
import { AuthStatusCard } from '../components/auth-status-card';
import { EmailOtpStep } from '../components/email-otp-step';

const TAX_CODE_PATTERN = /^\d{10}(\d{3})?$/;

type SignupStep = 'taxCode' | 'confirming' | 'form' | 'otp';

export function SignupPage() {
  const navigate = useNavigate();
  const { refreshUser } = useAuth();
  const [step, setStep] = useState<SignupStep>('taxCode');
  const [taxCode, setTaxCode] = useState('');
  const [resolvedName, setResolvedName] = useState('');
  const [organizationName, setOrganizationName] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [cameFromConfirming, setCameFromConfirming] = useState(false);

  const [taxCodeLoading, setTaxCodeLoading] = useState(false);
  const [taxCodeError, setTaxCodeError] = useState<string | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  function goToFormWithoutPrefill() {
    setOrganizationName('');
    setCameFromConfirming(false);
    setStep('form');
  }

  async function onTaxCodeSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setTaxCodeError(null);

    const code = taxCode.trim();
    if (!TAX_CODE_PATTERN.test(code)) {
      setTaxCodeError('Mã số thuế phải gồm 10 hoặc 13 chữ số.');
      return;
    }

    setTaxCodeLoading(true);
    try {
      const result = await apiRequest<{ name: string | null }>({
        url: `/api/v1/tax-verification/lookup?taxCode=${encodeURIComponent(code)}`,
        method: 'GET',
      });

      if (result.name) {
        setResolvedName(result.name);
        setStep('confirming');
      } else {
        goToFormWithoutPrefill();
      }
    } catch (error) {
      if (getApiErrorCode(error) === 'RATE_LIMIT_EXCEEDED') {
        setTaxCodeError(
          getApiErrorMessage(error) ??
            'Bạn đã thực hiện quá nhiều yêu cầu. Vui lòng thử lại sau.',
        );
      } else {
        // Silent fallback: lookup failure must never block signup
        goToFormWithoutPrefill();
      }
    } finally {
      setTaxCodeLoading(false);
    }
  }

  function onConfirmOrganization() {
    setOrganizationName(resolvedName);
    setCameFromConfirming(true);
    setStep('form');
  }

  async function onFormSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

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
    } catch (submitError) {
      setFormError(
        getApiErrorMessage(submitError) ??
          'Không thể tạo tài khoản. Vui lòng kiểm tra thông tin.',
      );
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
      <AuthStatusCard>
        <div className="space-y-5 text-left">
          <h1 className="text-xl font-semibold">Xác thực email</h1>
          <EmailOtpStep email={email} onVerified={onVerified} />
        </div>
      </AuthStatusCard>
    );
  }

  if (step === 'confirming') {
    return (
      <AuthStatusCard>
        <div className="space-y-5 text-left">
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold">Xác nhận tổ chức</h1>
            <p className="text-sm text-muted-foreground">
              Chúng tôi tìm thấy thông tin tổ chức tương ứng với mã số thuế.
            </p>
          </div>

          <Card className="p-4 space-y-2 text-sm bg-muted/40">
            <div>
              <span className="text-muted-foreground text-xs font-medium uppercase tracking-wider block">
                Mã số thuế
              </span>
              <span className="font-semibold text-foreground">{taxCode}</span>
            </div>
            <div>
              <span className="text-muted-foreground text-xs font-medium uppercase tracking-wider block">
                Tên tổ chức
              </span>
              <span className="font-semibold text-foreground">
                {resolvedName}
              </span>
            </div>
          </Card>

          <div className="space-y-3">
            <Button
              type="button"
              className="w-full"
              onClick={onConfirmOrganization}
            >
              Đúng, đây là tổ chức của tôi
            </Button>

            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={goToFormWithoutPrefill}
            >
              Không phải tổ chức của tôi
            </Button>

            <Button
              type="button"
              variant="ghost"
              className="w-full"
              onClick={() => setStep('taxCode')}
            >
              Quay lại
            </Button>
          </div>
        </div>
      </AuthStatusCard>
    );
  }

  if (step === 'form') {
    return (
      <AuthStatusCard>
        <form onSubmit={onFormSubmit} className="space-y-5 text-left">
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold">Tạo tài khoản</h1>
            <p className="text-sm text-muted-foreground">
              Bắt đầu quản lý công nợ cho doanh nghiệp của bạn.
            </p>
          </div>

          {!cameFromConfirming && (
            <p className="text-sm text-muted-foreground">
              Chúng tôi không xác minh được tổ chức tự động — vui lòng nhập tên
              tổ chức.
            </p>
          )}

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

          <InlineFormError message={formError} />

          <Button
            type="submit"
            disabled={submitting}
            aria-busy={submitting}
            className="w-full"
          >
            {submitting && <Spinner />}
            {submitting ? 'Đang xử lý…' : 'Tạo tài khoản'}
          </Button>

          <Button
            type="button"
            variant="ghost"
            className="w-full"
            disabled={submitting}
            onClick={() => {
              setStep(cameFromConfirming ? 'confirming' : 'taxCode');
            }}
          >
            Quay lại
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
      </AuthStatusCard>
    );
  }

  return (
    <AuthStatusCard>
      <form onSubmit={onTaxCodeSubmit} className="space-y-5 text-left">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">Tạo tài khoản</h1>
          <p className="text-sm text-muted-foreground">
            Bắt đầu quản lý công nợ cho doanh nghiệp của bạn.
          </p>
        </div>

        <label className="block space-y-1">
          <span className="text-sm font-medium">Mã số thuế</span>
          <input
            name="taxCode"
            required
            inputMode="numeric"
            maxLength={13}
            placeholder="VD: 0101234567"
            value={taxCode}
            onChange={(event) => {
              setTaxCode(event.target.value);
              if (taxCodeError) setTaxCodeError(null);
            }}
            className="h-10 w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </label>

        <InlineFormError message={taxCodeError} />

        <Button
          type="submit"
          disabled={taxCodeLoading}
          aria-busy={taxCodeLoading}
          className="w-full"
        >
          {taxCodeLoading && <Spinner />}
          {taxCodeLoading ? 'Đang kiểm tra…' : 'Tiếp tục'}
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
    </AuthStatusCard>
  );
}
