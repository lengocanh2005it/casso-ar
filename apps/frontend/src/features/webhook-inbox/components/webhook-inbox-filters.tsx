import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { WEBHOOK_INBOX_STATUS_OPTIONS } from '../labels';
import type { WebhookInboxStatus } from '../types';

export interface WebhookInboxFilterValues {
  status: 'ALL' | WebhookInboxStatus;
  providerTransactionId: string;
}

interface WebhookInboxFiltersBarProps {
  values: WebhookInboxFilterValues;
  onChange: (next: WebhookInboxFilterValues) => void;
}

export function WebhookInboxFiltersBar({
  values,
  onChange,
}: WebhookInboxFiltersBarProps) {
  return (
    <div className="grid gap-4 rounded-xl border bg-card p-4 shadow-sm sm:grid-cols-2">
      <div className="space-y-2">
        <Label htmlFor="webhook-inbox-status">Trạng thái</Label>
        <Select
          value={values.status}
          onValueChange={(status) =>
            onChange({
              ...values,
              status: status as WebhookInboxFilterValues['status'],
            })
          }
        >
          <SelectTrigger
            id="webhook-inbox-status"
            aria-label="Trạng thái"
            className="w-full"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {WEBHOOK_INBOX_STATUS_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="webhook-inbox-search">Mã giao dịch</Label>
        <Input
          id="webhook-inbox-search"
          name="providerTransactionId"
          type="search"
          autoComplete="off"
          placeholder="Tìm theo mã giao dịch…"
          value={values.providerTransactionId}
          onChange={(event) =>
            onChange({ ...values, providerTransactionId: event.target.value })
          }
        />
      </div>
    </div>
  );
}
