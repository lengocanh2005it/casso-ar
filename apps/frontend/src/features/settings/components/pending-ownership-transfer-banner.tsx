import { Button } from '@/components/ui/button';
import {
  useAcceptOwnershipTransfer,
  useDeclineOwnershipTransfer,
  usePendingOwnershipTransferForMe,
} from '../api/use-settings';

interface PendingOwnershipTransferBannerProps {
  organizationId: string | undefined;
}

export function PendingOwnershipTransferBanner({
  organizationId,
}: PendingOwnershipTransferBannerProps) {
  const pending = usePendingOwnershipTransferForMe(organizationId);
  const accept = useAcceptOwnershipTransfer(organizationId);
  const decline = useDeclineOwnershipTransfer(organizationId);

  const request = pending.data;
  if (!request) return null;

  return (
    <div
      role="alert"
      className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-primary/30 bg-primary/5 p-3"
    >
      <p className="text-sm">
        Bạn được đề nghị trở thành chủ sở hữu (OWNER) của tổ chức này.
      </p>
      <div className="flex gap-2">
        <Button
          size="sm"
          onClick={() => accept.mutate(request.id)}
          disabled={accept.isPending || decline.isPending}
        >
          Chấp nhận
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => decline.mutate(request.id)}
          disabled={accept.isPending || decline.isPending}
        >
          Từ chối
        </Button>
      </div>
    </div>
  );
}
