import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
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
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { OrganizationListItem } from '../api/admin-api';
import { useAdminOrganizations, useToggleOrganization } from '../api/use-admin';
import { BreakerSwitch } from '../components/breaker-switch';

const ORGANIZATION_PAGE_SIZE = 50;
const dateFormatter = new Intl.DateTimeFormat('vi-VN', {
  dateStyle: 'medium',
});

export function AdminOrganizationsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const page = Math.max(1, Number(searchParams.get('page') ?? '1') || 1);
  const organizationsQuery = useAdminOrganizations(
    page,
    ORGANIZATION_PAGE_SIZE,
  );
  const toggleOrganization = useToggleOrganization();
  const items = organizationsQuery.data?.items ?? [];
  const total = organizationsQuery.data?.total ?? 0;
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  function setPage(nextPage: number) {
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      next.set('page', String(nextPage));
      return next;
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
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">Chưa có tổ chức nào.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Tên tổ chức</TableHead>
              <TableHead className="font-mono">ID</TableHead>
              <TableHead>Ngày tạo</TableHead>
              <TableHead>Trạng thái</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((org) => {
              const displayName = org.name || 'tổ chức này';
              const isLocking = org.status === 'ACTIVE';

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
                      className="text-sm font-medium text-primary hover:underline"
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
                  <TableCell>
                    {dateFormatter.format(new Date(org.createdAt))}
                  </TableCell>
                  <TableCell>
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
