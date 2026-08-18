import { QRCodeSVG } from 'qrcode.react';
import { useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useAuth } from '@/contexts/auth-context';

const POLL_INTERVAL_MS = 5_000;

interface PaymentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  checkoutUrl: string;
}

export function PaymentDialog({
  open,
  onOpenChange,
  checkoutUrl,
}: PaymentDialogProps) {
  const { user, refreshUser } = useAuth();
  const initialPlanRef = useRef(user?.subscriptionPlan);

  // biome-ignore lint/correctness/useExhaustiveDependencies: capture the plan only at the moment the dialog opens, not on every plan change
  useEffect(() => {
    if (open) initialPlanRef.current = user?.subscriptionPlan;
  }, [open]);

  useEffect(() => {
    if (!open || user?.subscriptionPlan === initialPlanRef.current) return;
    onOpenChange(false);
    toast.success('Nâng cấp gói thành công!');
  }, [open, user?.subscriptionPlan, onOpenChange]);

  useEffect(() => {
    if (!open) return;
    const id = setInterval(() => void refreshUser(), POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [open, refreshUser]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Thanh toán nâng cấp gói</DialogTitle>
          <DialogDescription>
            Quét mã QR hoặc mở trang thanh toán để hoàn tất qua PayOS.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 text-center">
          <div className="mx-auto w-fit rounded-lg border p-3">
            <QRCodeSVG value={checkoutUrl} size={176} />
          </div>
          <Button
            variant="outline"
            className="w-full"
            onClick={() => window.open(checkoutUrl, '_blank')}
          >
            Mở trang thanh toán PayOS
          </Button>
          <p className="text-xs text-muted-foreground">
            Hệ thống tự cập nhật sau khi thanh toán xong. Có thể đóng cửa sổ này
            rồi quay lại sau.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
