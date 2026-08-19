import { useState } from 'react';
import { Link } from 'react-router-dom';
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

const ORGANIZATION_PAGE_SIZE = 50;
const dateFormatter = new Intl.DateTimeFormat('vi-VN', {
  dateStyle: 'medium',
});

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
        </DialogHeader>
        <div className="space-y-3">
          <Label className="block space-y-1">
            <span className="text-sm">Lý do từ chối</span>
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
      <p role="status" aria-live="polite">
        Đang tải tổ chức…
      </p>
    );
  }

  if (organizationsQuery.isError) {
    return (
      <div className="flex items-center gap-3">
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
    <div className="space-y-4">
      <div>
        <p className="text-sm font-medium text-primary">ADMIN CONSOLE</p>
        <h1 className="mt-1 text-balance text-2xl font-semibold tracking-tight">
          Organizations
        </h1>
      </div>

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

      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">Chưa có tổ chức nào.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Tên tổ chức</TableHead>
              <TableHead className="font-mono">ID</TableHead>
              <TableHead>Mã số thuế</TableHead>
              <TableHead>Ngày tạo</TableHead>
              <TableHead>Trạng thái</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((org) => {
              const displayName = org.name || 'tổ chức này';
              const isLocking = org.status === 'ACTIVE';
              const isPendingReview = org.status === 'PENDING_REVIEW';

              return (
                <TableRow key={org.id}>
                  <TableCell>
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
                  </TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    <span
                      className="block max-w-[14rem] truncate"
                      title={org.id}
                      translate="no"
                    >
                      {org.id}
                    </span>
                  </TableCell>
                  <TableCell className="text-sm">
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
                          <span title={org.taxCodeLookupName}>
                            {org.taxCodeLookupName}
                          </span>
                        )}
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    {dateFormatter.format(new Date(org.createdAt))}
                  </TableCell>
                  <TableCell>
                    {org.status === 'ACTIVE' || org.status === 'LOCKED' ? (
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <BreakerSwitch
                            checked={!isLocking}
                            disabled={pendingId === org.id}
                            onCheckedChange={() => undefined}
                            label={
                              isLocking
                                ? `Lock ${displayName}`
                                : `Unlock ${displayName}`
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
                              {isLocking ? 'Xác nhận khóa' : 'Xác nhận mở khóa'}
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
                                Tổ chức sẽ có thể truy cập hệ thống ngay sau khi
                                duyệt.
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
