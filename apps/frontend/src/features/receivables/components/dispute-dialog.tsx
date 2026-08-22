import { Permission } from '@casso-ledger/shared-types';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/contexts/auth-context';
import { hasPermission } from '@/lib/rbac';
import { openDispute, resolveDispute } from '../api/receivables-api';

export function DisputeDialog({
  receivableId,
  isDisputed,
  disputeId,
}: {
  receivableId: string;
  isDisputed: boolean;
  disputeId: string | null;
}) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const openMutation = useMutation({
    mutationFn: () => openDispute(receivableId, { reason }),
    onSuccess: () => {
      setReason('');
      setOpen(false);
      void queryClient.invalidateQueries({
        queryKey: ['receivable', receivableId],
      });
      void queryClient.invalidateQueries({
        queryKey: ['receivable-timeline', receivableId],
      });
    },
  });
  const resolveMutation = useMutation({
    mutationFn: () => resolveDispute(disputeId ?? ''),
    onSuccess: () => {
      setOpen(false);
      void queryClient.invalidateQueries({
        queryKey: ['receivable', receivableId],
      });
      void queryClient.invalidateQueries({
        queryKey: ['receivable-timeline', receivableId],
      });
    },
  });

  if (!hasPermission(user?.role ?? null, Permission.RECEIVABLE_DISPUTE)) {
    return null;
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          {isDisputed ? 'Đóng tranh chấp' : 'Mở tranh chấp'}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {isDisputed ? 'Đóng tranh chấp' : 'Mở tranh chấp'}
          </DialogTitle>
        </DialogHeader>
        {isDisputed ? (
          <Button
            variant="destructive"
            disabled={resolveMutation.isPending || disputeId === null}
            onClick={() => resolveMutation.mutate()}
          >
            Xác nhận đóng tranh chấp
          </Button>
        ) : (
          <div className="space-y-3">
            <Label className="block space-y-2">
              <span className="block text-sm">Lý do tranh chấp</span>
              <Textarea
                name="reason"
                required
                placeholder="Nhập lý do tranh chấp…"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
              />
            </Label>
            <Button
              disabled={!reason.trim() || openMutation.isPending}
              onClick={() => openMutation.mutate()}
            >
              Xác nhận mở tranh chấp
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
