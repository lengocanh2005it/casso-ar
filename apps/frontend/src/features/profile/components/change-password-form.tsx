import { useState } from 'react';
import { OtpInput } from '@/components/shared/otp-input';
import { PasswordStrength } from '@/components/shared/password-strength';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useResendCooldown } from '@/lib/use-resend-cooldown';
import {
  useConfirmChangePassword,
  useRequestChangePasswordOtp,
  useResendChangePasswordOtp,
} from '../api/use-change-password';

interface ChangePasswordFormProps {
  onBack: () => void;
  onSuccess: () => void;
}

export function ChangePasswordForm({
  onBack,
  onSuccess,
}: ChangePasswordFormProps) {
  const [step, setStep] = useState<'request' | 'confirm'>('request');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [otp, setOtp] = useState('');

  const requestOtp = useRequestChangePasswordOtp();
  const confirmChange = useConfirmChangePassword();
  const resendOtp = useResendChangePasswordOtp();
  const { remainingSeconds, triggerResend, reset } = useResendCooldown(
    'resend-cooldown:change-password',
  );

  function handleRequestOtp() {
    requestOtp.mutate(currentPassword, {
      onSuccess: () => setStep('confirm'),
    });
  }

  function handleResendOtp() {
    triggerResend(() => resendOtp.mutateAsync()).catch(() => {});
  }

  function handleConfirm() {
    if (newPassword !== confirmPassword) return;
    confirmChange.mutate(
      { otp, newPassword },
      {
        onSuccess: () => {
          reset();
          onSuccess();
        },
      },
    );
  }

  return (
    <div className="space-y-4">
      <Button variant="ghost" size="sm" onClick={onBack}>
        ← Quay lại
      </Button>

      {step === 'request' ? (
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="currentPassword">Mật khẩu hiện tại</Label>
            <Input
              id="currentPassword"
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
            />
          </div>
          <Button
            onClick={handleRequestOtp}
            disabled={!currentPassword || requestOtp.isPending}
          >
            {requestOtp.isPending ? 'Đang gửi…' : 'Gửi OTP'}
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Mã OTP (6 chữ số)</Label>
            <OtpInput value={otp} onChange={setOtp} />
            <Button
              variant="link"
              className="h-auto p-0 text-sm"
              onClick={handleResendOtp}
              disabled={resendOtp.isPending || remainingSeconds > 0}
            >
              {resendOtp.isPending
                ? 'Đang gửi…'
                : remainingSeconds > 0
                  ? `Gửi lại OTP (${remainingSeconds}s)`
                  : 'Gửi lại OTP'}
            </Button>
          </div>
          <div className="space-y-2">
            <Label htmlFor="newPassword">Mật khẩu mới</Label>
            <Input
              id="newPassword"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />
            <PasswordStrength password={newPassword} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirmPassword">Xác nhận mật khẩu mới</Label>
            <Input
              id="confirmPassword"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
            />
          </div>
          <Button
            onClick={handleConfirm}
            disabled={
              otp.length !== 6 ||
              !newPassword ||
              newPassword !== confirmPassword ||
              confirmChange.isPending
            }
          >
            {confirmChange.isPending ? 'Đang xác nhận…' : 'Đổi mật khẩu'}
          </Button>
        </div>
      )}
    </div>
  );
}
