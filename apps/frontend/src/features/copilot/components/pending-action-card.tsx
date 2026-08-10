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
    <Card className="border-amber-300">
      <CardHeader>
        <CardTitle className="text-sm">Confirm reminder email send</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <p>Receivable: {action.payload.receivableId}</p>
        <div className="flex gap-2">
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
