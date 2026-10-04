import { Building2 } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { EmptyState } from '@/components/layout/empty-state';
import { PageHeading } from '@/components/layout/page-heading';
import { TruncatedCopyId } from '@/components/shared/truncated-copy-id';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { formatDateTime } from '@/lib/format';
import { useUrlQueryParams } from '@/lib/use-url-query-params';
import type {
  AdminOrganizationStatusFilter,
  OrganizationListItem,
} from '../api/admin-api';
import {
  useAdminOrganizations,
  useApproveOrganization,
  useRejectOrganization,
  useToggleOrganization,
} from '../api/use-admin';
import { BreakerSwitch } from '../components/breaker-switch';
import { ORGANIZATION_STATUS_LABELS } from '../lib/organization-status-labels';

const ORGANIZATION_PAGE_SIZE = 50;

const STATUS_OPTIONS: {
  value: AdminOrganizationStatusFilter;
  label: string;
}[] = [
  { value: 'ALL', label: 'Tất cả' },
  { value: 'ACTIVE', label: 'Đang hoạt động' },
  { value: 'LOCKED', label: 'Đã khóa' },
  { value: 'PENDING_REVIEW', label: 'Chờ duyệt' },
  { value: 'REJECTED', label: 'Đã từ chối' },
];

function normalizeStatus(value: string | null): AdminOrganizationStatusFilter {
  const known = STATUS_OPTIONS.find((option) => option.value === value);
  return known ? known.value : 'ALL';
}

function RejectDialog({ organizationId }: { organizationId: string }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const rejectOrganization = useRejectOrganization();

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          Từ chối
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Từ chối tổ chức</DialogTitle>
          <DialogDescription>
            Tổ chức sẽ không được duyệt. Nêu rõ lý do để chủ sở hữu biết cần bổ
            sung gì.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Label className="block space-y-2">
            <span className="block text-sm">Lý do từ chối</span>
            <Textarea
              name="reason"
              required
              placeholder="Nhập lý do từ chối…"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
          </Label>
          <Button
            disabled={!reason.trim() || rejectOrganization.isPending}
            onClick={() =>
              rejectOrganization.mutate(
                { id: organizationId, reason: reason.trim() },
                { onSuccess: () => setOpen(false) },
              )
            }
          >
            Xác nhận từ chối
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function AdminOrganizationsPage() {
  const { searchParams, setPage, patch } = useUrlQueryParams();
  const page = Math.max(1, Number(searchParams.get('page') ?? '1') || 1);
  const status = normalizeStatus(searchParams.get('status'));
  const organizationsQuery = useAdminOrganizations(
    page,
    ORGANIZATION_PAGE_SIZE,
    status,
  );
  const toggleOrganization = useToggleOrganization();
  const approveOrganization = useApproveOrganization();
  const items = organizationsQuery.data?.items ?? [];
  const total = organizationsQuery.data?.total ?? 0;
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  function setStatusFilter(nextStatus: AdminOrganizationStatusFilter) {
    patch((next) => {
      next.set('status', nextStatus);
      next.delete('page');
    });
  }

  async function handleToggle(org: OrganizationListItem) {
    setPendingId(org.id);
    setActionError(null);
    try {
      await toggleOrganization.mutateAsync({
        id: org.id,
        action: org.status === 'ACTIVE' ? 'lock' : 'unlock',
      });
    } catch {
      setActionError(
        'Không thể cập nhật trạng thái tổ chức. Vui lòng thử lại.',
      );
    } finally {
      setPendingId(null);
    }
  }

  if (organizationsQuery.isPending) {
    return (
      <p
        role="status"
        aria-live="polite"
        className="rounded-xl border bg-card p-4"
      >
        Đang tải tổ chức…
      </p>
    );
  }

  if (organizationsQuery.isError) {
    return (
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-destructive/20 bg-destructive/5 p-4">
        <p role="alert" aria-live="polite" className="text-sm text-destructive">
          Không thể tải danh sách tổ chức. Vui lòng thử lại.
        </p>
        <Button
          variant="outline"
          size="sm"
          onClick={() => void organizationsQuery.refetch()}
        >
          Thử lại
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeading
        eyebrow="QUẢN LÝ TỔ CHỨC"
        title="Tổ chức"
        description="Quản lý danh sách tổ chức và trạng thái tài khoản."
        icon={Building2}
        tone="info"
      />

      <div
        data-testid="admin-organization-filter"
        className="flex w-fit flex-wrap items-center gap-3 rounded-xl border bg-card p-3 shadow-sm sm:p-4"
      >
        <Select value={status} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-56">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {/* The bar used to stretch the full content width around a single
            224px dropdown, so it read as an abandoned box. Reporting the
            count next to it also gives the filter row a purpose. */}
        <p className="text-sm text-muted-foreground tabular-nums">
          {total.toLocaleString('vi-VN')} tổ chức
        </p>
      </div>

      {items.length === 0 ? (
        <EmptyState
          density="compact"
          icon={Building2}
          title="Chưa có tổ chức nào."
        />
      ) : (
        <div
          data-testid="admin-organization-table"
          className="animate-fade-up overflow-hidden rounded-xl border bg-card shadow-sm motion-reduce:animate-none"
        >
          <Table>
            <TableHeader className="max-md:hidden">
              <TableRow>
                <TableHead>Tên tổ chức</TableHead>
                <TableHead className="font-mono">ID</TableHead>
                <TableHead>Mã số thuế</TableHead>
                <TableHead>Ngày tạo</TableHead>
                <TableHead>Trạng thái tài khoản</TableHead>
                <TableHead>Thao tác</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((org) => {
                const displayName = org.name || 'tổ chức này';
                const isLocking = org.status === 'ACTIVE';
                const isPendingReview = org.status === 'PENDING_REVIEW';

                return (
                  <TableRow key={org.id} className="max-md:grid">
                    <TableCell className="max-md:col-span-3 max-md:row-start-1">
                      <span
                        className="block max-w-[18rem] truncate"
                        title={org.name}
                      >
                        {org.name || 'Không có tên tổ chức'}
                      </span>
                      <Link
                        to={`/admin/organizations/${org.id}/members`}
                        className="rounded-md text-sm font-medium text-primary pointer-hover:hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        Thành viên
                      </Link>
                      <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground md:hidden">
                        {org.taxCode && <span>MST {org.taxCode}</span>}
                        {/* The tax-code column is hidden below md, so the match
                            flag has to ride along here or an operator on a
                            phone cannot tell a verified tax code from a
                            mismatched one. */}
                        {org.taxCode && (
                          <span>
                            {org.taxCodeMatched ? 'Khớp' : 'Không khớp'}
                          </span>
                        )}
                        <span>ID {org.id.slice(0, 8)}</span>
                        <span>Tạo {formatDateTime(org.createdAt)}</span>
                      </p>
                    </TableCell>
                    <TableCell className="text-muted-foreground max-md:hidden">
                      <TruncatedCopyId id={org.id} />
                    </TableCell>
                    <TableCell className="text-sm max-md:hidden">
                      <span>{org.taxCode || '—'}</span>
                      {org.taxCode && (
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Badge
                            variant={
                              org.taxCodeMatched ? 'default' : 'destructive'
                            }
                          >
                            {org.taxCodeMatched ? 'Khớp' : 'Không khớp'}
                          </Badge>
                          {org.taxCodeLookupName && (
                            <span
                              className="min-w-0 truncate"
                              title={org.taxCodeLookupName}
                            >
                              {org.taxCodeLookupName}
                            </span>
                          )}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="max-md:hidden">
                      {formatDateTime(org.createdAt)}
                    </TableCell>
                    <TableCell className="max-md:col-start-1 max-md:row-start-2">
                      <span className="flex items-center gap-2">
                        <Badge
                          variant={
                            isPendingReview
                              ? 'secondary'
                              : org.status === 'LOCKED'
                                ? 'destructive'
                                : org.status === 'REJECTED'
                                  ? 'destructive'
                                  : 'default'
                          }
                        >
                          {ORGANIZATION_STATUS_LABELS[org.status]}
                        </Badge>
                      </span>
                    </TableCell>
                    <TableCell className="max-md:col-start-2 max-md:row-start-2 max-md:justify-self-end">
                      {org.status === 'ACTIVE' || org.status === 'LOCKED' ? (
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <BreakerSwitch
                              checked={!isLocking}
                              disabled={pendingId === org.id}
                              onCheckedChange={() => undefined}
                              label={
                                isLocking
                                  ? `Khóa ${displayName}`
                                  : `Mở khóa ${displayName}`
                              }
                            />
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>
                                {isLocking
                                  ? `Khóa ${displayName}?`
                                  : `Mở khóa ${displayName}?`}
                              </AlertDialogTitle>
                              <AlertDialogDescription>
                                {isLocking
                                  ? 'Tổ chức sẽ không thể truy cập hệ thống cho đến khi được mở khóa.'
                                  : 'Tổ chức sẽ có thể truy cập hệ thống trở lại.'}
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Hủy</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => void handleToggle(org)}
                              >
                                {isLocking
                                  ? 'Xác nhận khóa'
                                  : 'Xác nhận mở khóa'}
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      ) : isPendingReview ? (
                        <div className="flex gap-2">
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button size="sm">Duyệt</Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>
                                  Duyệt {displayName}?
                                </AlertDialogTitle>
                                <AlertDialogDescription>
                                  Tổ chức sẽ có thể truy cập hệ thống ngay sau
                                  khi duyệt.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Hủy</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() =>
                                    approveOrganization.mutate(org.id)
                                  }
                                >
                                  Xác nhận duyệt
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                          <RejectDialog organizationId={org.id} />
                        </div>
                      ) : (
                        <Badge variant="destructive">Đã từ chối</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
      {total > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
          <span>
            Trang {page} /{' '}
            {Math.max(1, Math.ceil(total / ORGANIZATION_PAGE_SIZE))}
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page === 1}
              onClick={() => setPage(page - 1)}
            >
              Trước
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= Math.ceil(total / ORGANIZATION_PAGE_SIZE)}
              onClick={() => setPage(page + 1)}
            >
              Sau
            </Button>
          </div>
        </div>
      )}
      {actionError && (
        <p role="alert" aria-live="polite" className="text-sm text-destructive">
          {actionError}
        </p>
      )}
    </div>
  );
}
