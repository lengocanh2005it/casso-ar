import { ScrollText } from 'lucide-react';
import { Fragment } from 'react';
import { EmptyState } from '@/components/layout/empty-state';
import { TruncatedCopyId } from '@/components/shared/truncated-copy-id';
import { TruncatedText } from '@/components/shared/truncated-text';
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
      <TruncatedText value={label}>{label}</TruncatedText>
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
    <TableRow className="block bg-muted/30 lg:table-row">
      <TableCell colSpan={5} className="block px-3 py-3 lg:table-cell lg:px-2">
        <div className="space-y-3 text-sm">
          <div>
            <span className="text-muted-foreground">Địa chỉ IP: </span>
            <span>{item.ipAddress ?? '—'}</span>
          </div>
          {rows.length === 0 ? (
            <p className="text-muted-foreground">Không có thay đổi.</p>
          ) : (
            <table className="block w-full text-xs lg:table">
              <thead className="hidden lg:table-header-group">
                <tr className="text-left text-muted-foreground">
                  <th className="pr-4 py-1 font-normal">Trường</th>
                  <th className="pr-4 py-1 font-normal">Trước</th>
                  <th className="py-1 font-normal">Sau</th>
                </tr>
              </thead>
              <tbody className="block lg:table-row-group">
                {rows.map((row) => (
                  <tr
                    key={row.field}
                    className="grid grid-cols-2 gap-x-3 gap-y-1 border-b py-2 last:border-0 lg:table-row lg:border-0 lg:py-0"
                  >
                    <td className="col-span-2 min-w-0 break-words py-1 lg:table-cell lg:px-2">
                      {FIELD_LABELS[row.field] ?? row.field}
                    </td>
                    <td className="flex min-w-0 flex-col gap-1 break-words py-1 lg:table-cell lg:px-2">
                      <span className="text-xs text-muted-foreground lg:hidden">
                        Trước
                      </span>
                      <FieldValue
                        field={row.field}
                        value={row.before}
                        display={item.display}
                      />
                    </td>
                    <td className="flex min-w-0 flex-col gap-1 break-words py-1 lg:table-cell lg:px-2">
                      <span className="text-xs text-muted-foreground lg:hidden">
                        Sau
                      </span>
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
      <Table className="block lg:table">
        <TableHeader className="hidden lg:table-header-group">
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
        <TableBody className="block lg:table-row-group">
          {items.map((item) => (
            <Fragment key={item.id}>
              <TableRow className="grid grid-cols-1 gap-y-2 px-3 py-3 lg:table-row lg:px-0 lg:py-0">
                <TableCell className="flex min-w-0 flex-col gap-1 px-0 py-1 lg:table-cell lg:px-2 lg:py-2">
                  <span className="text-xs font-normal text-muted-foreground lg:hidden">
                    Thời điểm
                  </span>
                  <span className="break-words">
                    {formatDateTime(item.createdAt)}
                  </span>
                </TableCell>
                <TableCell className="flex min-w-0 flex-col gap-1 px-0 py-1 lg:table-cell lg:px-2 lg:py-2">
                  <span className="text-xs font-normal text-muted-foreground lg:hidden">
                    Người thực hiện
                  </span>
                  <span className="break-words">
                    {actorLabel(item.userId, members)}
                  </span>
                </TableCell>
                <TableCell className="flex min-w-0 flex-col gap-1 px-0 py-1 lg:table-cell lg:px-2 lg:py-2">
                  <span className="text-xs font-normal text-muted-foreground lg:hidden">
                    Hành động
                  </span>
                  {ACTION_TYPE_LABELS[item.actionType] ?? item.actionType}
                </TableCell>
                <TableCell className="flex min-w-0 flex-col gap-1 px-0 py-1 lg:table-cell lg:px-2 lg:py-2">
                  <span className="text-xs font-normal text-muted-foreground lg:hidden">
                    Đối tượng
                  </span>
                  <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                    {item.display?.entityLabel ? (
                      <>
                        <span className="text-muted-foreground">
                          {ENTITY_TYPE_LABELS[item.entityType] ??
                            item.entityType}
                          :
                        </span>
                        <TruncatedText
                          className="max-w-64 truncate"
                          value={item.display.entityLabel}
                        >
                          {item.display.entityLabel}
                        </TruncatedText>
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
                <TableCell className="flex items-center justify-between px-0 pt-1 pb-0 lg:table-cell lg:px-2 lg:py-2">
                  <span className="text-xs font-normal text-muted-foreground lg:hidden">
                    Thao tác
                  </span>
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
