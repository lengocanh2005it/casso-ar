import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { formatDate } from '@/lib/format';
import { useAuthorizationAuditEvents } from '../api/use-bank-connections';
import type { ConnectionAuditEvent, ConnectionAuditEventType } from '../types';

const eventTypeLabels: Record<ConnectionAuditEventType, string> = {
  TOKEN_EXCHANGED: 'Kết nối lần đầu',
  RECONNECTED: 'Kết nối lại',
  DISCONNECTED: 'Ngắt kết nối',
  API_KEY_ROTATED: 'Đổi API Key',
  API_KEY_REVEALED: 'Xem API Key',
};

function EventDetails({ event }: { event: ConnectionAuditEvent }) {
  if (event.eventType === 'API_KEY_ROTATED') {
    return (
      <div className="mt-1 space-y-0.5 text-sm text-muted-foreground">
        {event.oldMaskedApiKey && event.newMaskedApiKey && (
          <p>
            API Key: {event.oldMaskedApiKey} → {event.newMaskedApiKey}
          </p>
        )}
        {event.oldBankName &&
          event.newBankName &&
          event.oldBankName !== event.newBankName && (
            <p>
              Ngân hàng: {event.oldBankName} → {event.newBankName}
            </p>
          )}
        {event.oldAccountHolderName &&
          event.newAccountHolderName &&
          event.oldAccountHolderName !== event.newAccountHolderName && (
            <p>
              Chủ tài khoản: {event.oldAccountHolderName} →{' '}
              {event.newAccountHolderName}
            </p>
          )}
      </div>
    );
  }
  if (event.maskedApiKey) {
    return (
      <p className="mt-1 text-sm text-muted-foreground">
        API Key: {event.maskedApiKey}
      </p>
    );
  }
  return null;
}

export function AuthorizationHistoryDialog({
  authorizationId,
}: {
  authorizationId: string;
}) {
  const [open, setOpen] = useState(false);
  const { data, isPending, isError } = useAuthorizationAuditEvents(
    authorizationId,
    open,
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          Lịch sử
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Lịch sử API Key</DialogTitle>
          <DialogDescription>
            Các sự kiện kết nối, đổi và ngắt API Key Casso Flow cho nhóm tài
            khoản này.
          </DialogDescription>
        </DialogHeader>
        {isPending && (
          <p role="status" aria-live="polite">
            Đang tải…
          </p>
        )}
        {isError && (
          <p role="alert" aria-live="polite" className="text-destructive">
            Không thể tải lịch sử.
          </p>
        )}
        {data && data.items.length === 0 && (
          <p className="text-sm text-muted-foreground">Chưa có lịch sử.</p>
        )}
        {data && data.items.length > 0 && (
          <ol className="max-h-96 space-y-4 overflow-y-auto">
            {data.items.map((event) => (
              <li key={event.id} className="rounded-lg border p-4">
                <div className="flex items-center justify-between gap-4">
                  <span className="font-medium">
                    {eventTypeLabels[event.eventType]}
                  </span>
                  <time className="text-sm text-muted-foreground">
                    {formatDate(event.createdAt)}
                  </time>
                </div>
                <EventDetails event={event} />
              </li>
            ))}
          </ol>
        )}
      </DialogContent>
    </Dialog>
  );
}
