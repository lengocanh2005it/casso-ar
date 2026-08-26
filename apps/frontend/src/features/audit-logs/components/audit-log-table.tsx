import { ScrollText } from 'lucide-react';
import { Fragment } from 'react';
import { EmptyState } from '@/components/layout/empty-state';
import { TruncatedCopyId } from '@/components/shared/truncated-copy-id';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { OrganizationMember } from '@/features/settings/types';
import { actorLabel } from '@/lib/actor-label';
import { formatDate, formatDateTime, formatVND } from '@/lib/format';
import { useUrlQueryParams } from '@/lib/use-url-query-params';
import {
  ACTION_TYPE_LABELS,
  ENTITY_TYPE_LABELS,
  FIELD_LABELS,
} from '../labels';
import type { AuditLogDisplay, AuditLogItem } from '../types';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Every @Column('bigint') money field across the app (apps/backend/src/modules/**/*.orm-entity.ts),
// so a new field shown in an audit payload renders as VND, not a raw number.
const MONEY_FIELD_NAMES = new Set([
  'amount',
  'allocatedAmount',
  'creditLimit',
  'originalAmount',
  'paidAmount',
  'remainingAmount',
  'taxAmount',
  'totalAmount',
  'unallocatedAmount',
]);

const DATE_ONLY_FIELD_NAMES = new Set(['dueDate', 'issueDate']);

const DATE_TIME_FIELD_NAMES = new Set([
  'createdAt',
  'updatedAt',
  'closedAt',
  'resolvedAt',
  'allocatedAt',
  'deletedAt',
  'receivedAt',
  'sentAt',
  'invitedAt',
  'expiresAt',
  'lastSyncAt',
  'effectiveAt',
  'transactionDateTime',
]);

function formatDateField(field: string, value: unknown): string | null {
  if (typeof value !== 'string' && !(value instanceof Date)) return null;
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return null;
  if (DATE_ONLY_FIELD_NAMES.has(field)) return formatDate(date);
  if (
    DATE_TIME_FIELD_NAMES.has(field) ||
    field.endsWith('At') ||
    field.endsWith('DateTime')
  ) {
    return formatDateTime(date);
  }
  return null;
}

function ReferenceValue({ id, label }: { id: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span title={label}>{label}</span>
      <TruncatedCopyId id={id} />
    </span>
  );
}

function FieldValue({
  field,
  value,
  display,
}: {
  field: string;
  value: unknown;
  display?: AuditLogDisplay;
}) {
  if (value === undefined || value === null) return <>—</>;
  if (typeof value === 'number' && MONEY_FIELD_NAMES.has(field)) {
    return <>{formatVND(value)}</>;
  }
  if (typeof value === 'string') {
    const formattedDate = formatDateField(field, value);
    if (formattedDate) return <>{formattedDate}</>;

    if (field === 'customerId') {
      const customerName = display?.customerNames[value];
      if (customerName) {
        return <ReferenceValue id={value} label={customerName} />;
      }
    }
    if (field === 'invoiceId') {
      const invoiceNumber = display?.invoiceNumbers[value];
      if (invoiceNumber) {
        return <ReferenceValue id={value} label={invoiceNumber} />;
      }
    }
  }
  if (typeof value === 'string' && UUID_PATTERN.test(value)) {
    return <TruncatedCopyId id={value} />;
  }
  if (typeof value === 'object') return <>{JSON.stringify(value)}</>;
  return <>{String(value)}</>;
}

interface FieldDiffRow {
  field: string;
  before: unknown;
  after: unknown;
}

function fieldDiffRows(
  before: Record<string, unknown> | null,
  after: Record<string, unknown> | null,
): FieldDiffRow[] {
  const keys = new Set([
    ...Object.keys(before ?? {}),
    ...Object.keys(after ?? {}),
  ]);
  return [...keys].sort().map((field) => ({
    field,
    before: before?.[field],
    after: after?.[field],
  }));
}

function DetailRow({ item }: { item: AuditLogItem }) {
  const rows = fieldDiffRows(item.beforeState, item.afterState);
  return (
    <TableRow className="bg-muted/30">
      <TableCell colSpan={5}>
        <div className="space-y-3 text-sm">
          <div>
            <span className="text-muted-foreground">Địa chỉ IP: </span>
            <span>{item.ipAddress ?? '—'}</span>
          </div>
          {rows.length === 0 ? (
            <p className="text-muted-foreground">Không có thay đổi.</p>
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-muted-foreground">
                  <th className="pr-4 py-1 font-normal">Trường</th>
                  <th className="pr-4 py-1 font-normal">Trước</th>
                  <th className="py-1 font-normal">Sau</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.field}>
                    <td className="pr-4 py-1">
                      {FIELD_LABELS[row.field] ?? row.field}
                    </td>
                    <td className="pr-4 py-1">
                      <FieldValue
                        field={row.field}
                        value={row.before}
                        display={item.display}
                      />
                    </td>
                    <td className="py-1">
                      <FieldValue
                        field={row.field}
                        value={row.after}
                        display={item.display}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </TableCell>
    </TableRow>
  );
}

interface AuditLogTableProps {
  items: AuditLogItem[];
  members: OrganizationMember[];
}

export function AuditLogTable({ items, members }: AuditLogTableProps) {
  const { searchParams, patch } = useUrlQueryParams();
  const expandedId = searchParams.get('expanded');

  function toggleExpanded(id: string) {
    patch((next) => {
      if (next.get('expanded') === id) {
        next.delete('expanded');
      } else {
        next.set('expanded', id);
      }
    });
  }

  return (
    <div className="overflow-x-auto rounded-xl border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Thời điểm</TableHead>
            <TableHead>Người thực hiện</TableHead>
            <TableHead>Hành động</TableHead>
            <TableHead>Đối tượng</TableHead>
            <TableHead>
              <span className="sr-only">Chi tiết</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item) => (
            <Fragment key={item.id}>
              <TableRow className="align-middle">
                <TableCell>{formatDateTime(item.createdAt)}</TableCell>
                <TableCell>{actorLabel(item.userId, members)}</TableCell>
                <TableCell>
                  {ACTION_TYPE_LABELS[item.actionType] ?? item.actionType}
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1.5">
                    {item.display?.entityLabel ? (
                      <>
                        <span className="text-muted-foreground">
                          {ENTITY_TYPE_LABELS[item.entityType] ??
                            item.entityType}
                          :
                        </span>
                        <span
                          className="max-w-64 truncate"
                          title={item.display.entityLabel}
                        >
                          {item.display.entityLabel}
                        </span>
                      </>
                    ) : (
                      <span>
                        {ENTITY_TYPE_LABELS[item.entityType] ?? item.entityType}
                      </span>
                    )}
                    {item.entityId ? (
                      <TruncatedCopyId id={item.entityId} />
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-expanded={expandedId === item.id}
                    onClick={() => toggleExpanded(item.id)}
                  >
                    Chi tiết
                  </Button>
                </TableCell>
              </TableRow>
              {expandedId === item.id && <DetailRow item={item} />}
            </Fragment>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

export function AuditLogEmpty() {
  return (
    <EmptyState
      density="compact"
      icon={ScrollText}
      title="Chưa có nhật ký nào trong khoảng thời gian này."
      description="Điều chỉnh bộ lọc hoặc chọn khoảng thời gian khác để xem nhật ký."
    />
  );
}
