import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { GLOBAL_EVENTS, useGlobalEvent } from '@/lib/global-events';

export function usePlanLimitDialog() {
  const [open, setOpen] = useState(false);

  useGlobalEvent(GLOBAL_EVENTS.PLAN_LIMIT, () => setOpen(true));

  return { open, setOpen };
}

export function UpgradeDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Đã đạt giới hạn gói hiện tại</DialogTitle>
          <DialogDescription>
            Liên hệ đội ngũ Casso để nâng cấp gói và tiếp tục sử dụng.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button onClick={() => onOpenChange(false)}>Liên hệ sales</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
