import { useState } from 'react';
import { OtpInput } from '@/components/shared/otp-input';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  useCancelOwnershipTransfer,
  useConfirmOwnershipTransfer,
  useCurrentOwnershipTransfer,
  useRequestOwnershipTransfer,
} from '../api/use-settings';

interface OwnershipTransferCandidate {
  userId: string;
  name: string;
  email: string;
}

interface OwnershipTransferDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: string;
  candidates: OwnershipTransferCandidate[];
}

export function OwnershipTransferDialog({
  open,
  onOpenChange,
  organizationId,
  candidates,
}: OwnershipTransferDialogProps) {
  const [targetUserId, setTargetUserId] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [otp, setOtp] = useState('');

  const current = useCurrentOwnershipTransfer(organizationId);
  const requestTransfer = useRequestOwnershipTransfer(organizationId);
  const confirmTransfer = useConfirmOwnershipTransfer(organizationId);
  const cancelTransfer = useCancelOwnershipTransfer(organizationId);

  const pending = current.data;
  const step = pending?.status === 'PENDING_OTP_CONFIRMATION' ? 'confirm' : 'request';

  function submitRequest() {
    if (!targetUserId || !currentPassword) return;
    requestTransfer.mutate({ targetUserId, currentPassword });
  }

  function submitConfirm() {
    if (!pending || otp.length !== 6) return;
    confirmTransfer.mutate(
      { requestId: pending.id, otp },
      { onSuccess: () => onOpenChange(false) },
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Chuyển quyền sở hữu</DialogTitle>
        </DialogHeader>

        {step === 'request' ? (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="ownership-transfer-target">Người nhận</Label>
              <Select value={targetUserId} onValueChange={setTargetUserId}>
                <SelectTrigger id="ownership-transfer-target" aria-label="Người nhận">
                  <SelectValue placeholder="Chọn thành viên" />
                </SelectTrigger>
                <SelectContent>
                  {candidates.map((candidate) => (
                    <SelectItem key={candidate.userId} value={candidate.userId}>
                      {candidate.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="ownership-transfer-password">Mật khẩu hiện tại</Label>
              <Input
                id="ownership-transfer-password"
                type="password"
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
              />
            </div>
            <Button
              onClick={submitRequest}
              disabled={!targetUserId || !currentPassword || requestTransfer.isPending}
            >
              {requestTransfer.isPending ? 'Đang gửi…' : 'Gửi OTP'}
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Mã OTP (6 chữ số)</Label>
              <OtpInput value={otp} onChange={setOtp} />
            </div>
            <div className="flex gap-2">
              <Button
                onClick={submitConfirm}
                disabled={otp.length !== 6 || confirmTransfer.isPending}
              >
                {confirmTransfer.isPending ? 'Đang xác nhận…' : 'Xác nhận'}
              </Button>
              <Button
                variant="outline"
                onClick={() => pending && cancelTransfer.mutate(pending.id)}
                disabled={cancelTransfer.isPending}
              >
                Huỷ yêu cầu
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
