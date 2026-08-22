import { CircleAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export function PendingActionCard({
  action,
  onConfirm,
  onCancel,
  busy,
}: {
  action: { id: string; payload: { receivableId: string; draftId: string } };
  onConfirm: () => void;
  onCancel: () => void;
  busy: boolean;
}) {
  return (
    <Card className="border-primary/20 bg-primary/[0.03] shadow-none dark:border-primary/30">
      <CardHeader className="flex-row items-center gap-2 space-y-0">
        <CircleAlert
          aria-hidden="true"
          className="size-4 shrink-0 text-primary"
        />
        <CardTitle className="text-sm">Confirm reminder email send</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <p>Receivable: {action.payload.receivableId}</p>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" disabled={busy} onClick={onConfirm}>
            Confirm
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={onCancel}
          >
            Cancel
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          The action expires after 10 minutes if not confirmed.
        </p>
      </CardContent>
    </Card>
  );
}
