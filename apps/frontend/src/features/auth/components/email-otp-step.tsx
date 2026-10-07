import { type FormEvent, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { OtpInput } from '@/components/shared/otp-input';
import { ResendCodeButton } from '@/components/shared/resend-code-button';
import { Button } from '@/components/ui/button';
import { InlineFormError } from '@/components/ui/inline-form-error';
import { Spinner } from '@/components/ui/spinner';
import {
  apiRequest,
  getApiErrorCode,
  getApiErrorMessage,
} from '@/lib/api-client';
import { maskEmail } from '@/lib/mask-email';
import {
  buildResendCooldownKey,
  useResendCooldown,
} from '@/lib/use-resend-cooldown';

interface VerifyEmailResult {
  verified: boolean;
  accessToken: string;
}

interface EmailOtpStepProps {
  email: string;
  onVerified: (result: VerifyEmailResult) => void;
}

const DEFAULT_REJECTED_MESSAGE =
  'Đăng ký tổ chức của bạn chưa được chấp thuận.';

const PENDING_NEXT_STEPS = [
  'Chúng tôi kiểm tra thông tin tổ chức của bạn.',
  'Bạn nhận email kết quả ngay khi có quyết định.',
  'Sau khi được duyệt, đăng nhập để bắt đầu thiết lập.',
] as const;

type StepState = 'otp' | 'pending-review' | 'rejected';

export function EmailOtpStep({ email, onVerified }: EmailOtpStepProps) {
  const [state, setState] = useState<StepState>('otp');
  const [otp, setOtp] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [resending, setResending] = useState(false);
  const [resendSent, setResendSent] = useState(false);
  const [rejectedMessage, setRejectedMessage] = useState(
    DEFAULT_REJECTED_MESSAGE,
  );
  const { remainingSeconds, triggerResend, reset } = useResendCooldown(
    buildResendCooldownKey('email-verification', email),
  );

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setConfirming(true);
    setConfirmError(null);

    try {
      const result = await apiRequest<VerifyEmailResult>({
        url: '/api/v1/auth/verify-email',
        method: 'POST',
        data: { email, otp },
      });
      reset();
      onVerified(result);
    } catch (error) {
      const errorCode = getApiErrorCode(error);
      if (errorCode === 'ORGANIZATION_PENDING_REVIEW') {
        setState('pending-review');
        return;
      }
      if (errorCode === 'ORGANIZATION_REJECTED') {
        setRejectedMessage(
          getApiErrorMessage(error) ?? DEFAULT_REJECTED_MESSAGE,
        );
        setState('rejected');
        return;
      }
      setConfirmError(
        errorCode === 'UNAUTHORIZED'
          ? 'Mã không hợp lệ hoặc đã hết hạn. Vui lòng thử lại hoặc gửi lại mã.'
          : (getApiErrorMessage(error) ?? 'Đã xảy ra lỗi. Vui lòng thử lại.'),
      );
    } finally {
      setConfirming(false);
    }
  }

  async function onResend() {
    setResending(true);
    setResendSent(false);
    try {
      await triggerResend(() =>
        apiRequest({
          url: '/api/v1/auth/resend-verification',
          method: 'POST',
          data: { email },
        }),
      );
      setResendSent(true);
    } catch (error) {
      toast.error(
        getApiErrorMessage(error) ??
          'Không thể gửi lại mã. Vui lòng thử lại sau.',
      );
    } finally {
      setResending(false);
    }
  }

  if (state === 'pending-review') {
    return (
      <div
        role="status"
        className="animate-fade-up motion-reduce:animate-none space-y-5 text-left"
      >
        <div className="space-y-2 text-center">
          <h2 className="text-lg font-semibold">Email đã được xác minh</h2>
          <p className="text-sm text-muted-foreground">
            Tổ chức của bạn đang chờ được duyệt — chúng tôi sẽ gửi email khi có
            kết quả.
          </p>
        </div>
        <ul className="space-y-2.5">
          {PENDING_NEXT_STEPS.map((step, index) => (
            <li key={step} className="flex gap-3 text-sm">
              <span
                aria-hidden="true"
                className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary"
              >
                {index + 1}
              </span>
              <span className="text-foreground">{step}</span>
            </li>
          ))}
        </ul>
        <Button variant="link" className="h-auto p-0 text-sm" asChild>
          <Link to="/login">Đến trang đăng nhập</Link>
        </Button>
      </div>
    );
  }

  if (state === 'rejected') {
    return (
      <div
        role="alert"
        className="animate-fade-up motion-reduce:animate-none space-y-2 rounded-xl border border-destructive/20 bg-destructive/5 p-4 text-center"
      >
        <h2 className="text-lg font-semibold text-destructive">
          Đăng ký chưa được chấp thuận
        </h2>
        <p className="text-sm text-foreground">{rejectedMessage}</p>
        <Link
          to="/login"
          className="text-primary pointer-hover:hover:underline"
        >
          Đến trang đăng nhập
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4 text-left">
      {/* The heading lives here, not in the page: the terminal states below
          replace this whole form, and must not inherit "Xác thực email". */}
      <h1 className="text-xl font-semibold">Xác thực email</h1>
      <p className="text-sm text-muted-foreground">
        Mã đã được gửi tới email{' '}
        {/* The masked domain can be 60+ unbroken characters, which
            overflowed the card at every width. */}
        <span className="font-medium break-all text-foreground">
          {maskEmail(email)}
        </span>
        . Vui lòng nhập mã bên dưới.
      </p>

      <OtpInput value={otp} onChange={setOtp} />

      <InlineFormError message={confirmError} />
      {resendSent && (
        <p
          className="animate-banner-in motion-reduce:animate-none text-sm text-muted-foreground"
          role="status"
        >
          Nếu email này cần xác thực, hệ thống sẽ gửi mã mới. Hãy kiểm tra hộp
          thư.
        </p>
      )}

      <Button
        type="submit"
        disabled={otp.length !== 6 || confirming}
        aria-busy={confirming}
        className="w-full"
      >
        {confirming && <Spinner />}
        {confirming ? 'Đang xác nhận…' : 'Xác nhận'}
      </Button>

      <ResendCodeButton
        label="Gửi lại mã"
        pending={resending}
        remainingSeconds={remainingSeconds}
        onClick={onResend}
      />

      <Button variant="link" className="h-auto p-0 text-sm" asChild>
        <Link to="/login">← Quay lại đăng nhập</Link>
      </Button>
    </form>
  );
}
