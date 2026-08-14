import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
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
import {
  listOrganizations,
  lockOrganization,
  type OrganizationListItem,
  unlockOrganization,
} from '../api/admin-api';
import { BreakerSwitch } from '../components/breaker-switch';

export function AdminOrganizationsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const page = Math.max(1, Number(searchParams.get('page') ?? '1') || 1);
  const limit = 50;
  const [items, setItems] = useState<OrganizationListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);

  const dateFormatter = new Intl.DateTimeFormat('vi-VN', {
    dateStyle: 'medium',
  });

  const reload = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await listOrganizations(page, limit);
      setItems(result.items);
      setTotal(result.total);
    } catch {
      setError('Không thể tải danh sách tổ chức. Vui lòng thử lại.');
    } finally {
      setIsLoading(false);
    }
  }, [page]);

  useEffect(() => {
    void reload();
  }, [reload]);

  function setPage(nextPage: number) {
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      next.set('page', String(nextPage));
      return next;
    });
  }

  async function handleToggle(org: OrganizationListItem) {
    setPendingId(org.id);
    setError(null);
    try {
      if (org.status === 'ACTIVE') {
        await lockOrganization(org.id);
      } else {
        await unlockOrganization(org.id);
      }
      await reload();
    } catch {
      setError('Không thể cập nhật trạng thái tổ chức. Vui lòng thử lại.');
    } finally {
      setPendingId(null);
    }
  }

  if (isLoading) {
    return (
      <p role="status" aria-live="polite">
        Đang tải tổ chức…
      </p>
    );
  }

  if (error) {
    return (
      <div className="flex items-center gap-3">
        <p role="alert" aria-live="polite" className="text-sm text-destructive">
          {error}
        </p>
        <Button variant="outline" size="sm" onClick={() => void reload()}>
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
            Trang {page} / {Math.max(1, Math.ceil(total / limit))}
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
              disabled={page >= Math.ceil(total / limit)}
              onClick={() => setPage(page + 1)}
            >
              Sau
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
