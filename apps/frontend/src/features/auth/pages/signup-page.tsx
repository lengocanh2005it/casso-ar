import { type FormEvent, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { InlineFormError } from '@/components/ui/inline-form-error';
import { Spinner } from '@/components/ui/spinner';
import { useAuth } from '@/contexts/auth-context';
import {
  apiRequest,
  authTokenManager,
  getApiErrorMessage,
} from '@/lib/api-client';
import { AuthStatusCard } from '../components/auth-status-card';
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

  // Refs for async lookup guards — must be read after await to see current values
  const organizationNameRef = useRef('');
  const taxCodeRef = useRef('');
  const organizationNameUserEditedRef = useRef(false);
  const autoFilledOrganizationNameRef = useRef<string | null>(null);
  const lookupSequence = useRef(0);
  const lastLookupTaxCode = useRef<string | null>(null);

  function onOrganizationNameChange(value: string) {
    organizationNameRef.current = value;
    organizationNameUserEditedRef.current = true;
    autoFilledOrganizationNameRef.current = null;
    setOrganizationName(value);
  }

  function onTaxCodeChange(value: string) {
    // Clear the auto-filled name when tax code changes, but only if the current
    // name is still the one we auto-filled (i.e., user hasn't edited it)
    if (
      !organizationNameUserEditedRef.current &&
      autoFilledOrganizationNameRef.current !== null &&
      organizationNameRef.current === autoFilledOrganizationNameRef.current
    ) {
      organizationNameRef.current = '';
      autoFilledOrganizationNameRef.current = null;
      setOrganizationName('');
    }
    // Reset so a changed-back code can be looked up again
    lastLookupTaxCode.current = null;
    taxCodeRef.current = value;
    setTaxCode(value);
  }

  async function onTaxCodeBlur() {
    const code = taxCodeRef.current.trim();

    if (!TAX_CODE_PATTERN.test(code)) return;
    if (lastLookupTaxCode.current === code) return;

    lastLookupTaxCode.current = code;
    lookupSequence.current += 1;
    const mySequence = lookupSequence.current;

    try {
      const result = await apiRequest<{ name: string | null }>({
        url: `/api/v1/tax-verification/lookup?taxCode=${encodeURIComponent(code)}`,
        method: 'GET',
      });

      // Guard against stale responses
      if (
        mySequence !== lookupSequence.current ||
        taxCodeRef.current.trim() !== code ||
        organizationNameUserEditedRef.current ||
        organizationNameRef.current.trim() !== ''
      ) {
        return;
      }

      if (result.name !== null) {
        organizationNameRef.current = result.name;
        autoFilledOrganizationNameRef.current = result.name;
        setOrganizationName(result.name);
      }
    } catch {
      // Silent: lookup failure must never block signup
    }
  }

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
    } catch (submitError) {
      setError(
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

  return (
    <AuthStatusCard>
      <form onSubmit={onSubmit} className="space-y-5 text-left">
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
            onChange={(event) => onOrganizationNameChange(event.target.value)}
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
            onChange={(event) => onTaxCodeChange(event.target.value)}
            onBlur={onTaxCodeBlur}
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
    </AuthStatusCard>
  );
}
