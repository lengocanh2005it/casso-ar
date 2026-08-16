import type { Role } from '@casso-ledger/shared-types';
import { useEffect, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
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
import { Input } from '@/components/ui/input';
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
import type {
  AdminMemberItem,
  AdminMemberStatusFilter,
} from '../api/admin-api';
import {
  useAdminOrganization,
  useBlockOrganizationMember,
  useOrganizationMembers,
} from '../api/use-admin';
import { BreakerSwitch } from '../components/breaker-switch';

const MEMBER_PAGE_SIZE = 50;
const SEARCH_DEBOUNCE_MS = 300;
const dateFormatter = new Intl.DateTimeFormat('vi-VN', { dateStyle: 'medium' });

const STATUS_OPTIONS: { value: AdminMemberStatusFilter; label: string }[] = [
  { value: 'ALL', label: 'Tất cả' },
  { value: 'ACTIVE', label: 'Đang hoạt động' },
  { value: 'BLOCKED', label: 'Bị chặn' },
  { value: 'PENDING', label: 'Đang chờ' },
];

const ROLE_LABELS: Record<Role, string> = {
  OWNER: 'Chủ sở hữu',
  FINANCE_MANAGER: 'Quản lý tài chính',
  ACCOUNTANT: 'Kế toán',
  SALES_REP: 'Nhân viên kinh doanh',
  VIEWER: 'Người xem',
};

function normalizeStatus(value: string | null): AdminMemberStatusFilter {
  const known = STATUS_OPTIONS.find((option) => option.value === value);
  return known ? known.value : 'ALL';
}

export function AdminOrganizationMembersPage() {
  const { organizationId = '' } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();

  const rawPage = Number(searchParams.get('page') ?? '1');
  const page = Number.isInteger(rawPage) && rawPage >= 1 ? rawPage : 1;
  const status = normalizeStatus(searchParams.get('status'));
  const search = searchParams.get('search') ?? '';

  const organizationQuery = useAdminOrganization(organizationId);
  const membersQuery = useOrganizationMembers(
    organizationId,
    page,
    MEMBER_PAGE_SIZE,
    status,
    search,
  );
  const blockMember = useBlockOrganizationMember();
  const [pendingUserId, setPendingUserId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState(search);
  const [committedSearch, setCommittedSearch] = useState(search);
  if (committedSearch !== search) {
    setCommittedSearch(search);
    setSearchInput(search);
  }
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, []);

  function handleSearchChange(value: string) {
    setSearchInput(value);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => {
      setFilters(status, value);
    }, SEARCH_DEBOUNCE_MS);
  }

  function setFilters(nextStatus: AdminMemberStatusFilter, nextSearch: string) {
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      next.set('status', nextStatus);
      if (nextSearch) {
        next.set('search', nextSearch);
      } else {
        next.delete('search');
      }
      next.delete('page');
      return next;
    });
  }

  function setPage(nextPage: number) {
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      next.set('page', String(nextPage));
      return next;
    });
  }

  async function handleToggle(member: AdminMemberItem) {
    const action = member.status === 'BLOCKED' ? 'unblock' : 'block';
    setPendingUserId(member.userId);
    setActionError(null);
    try {
      await blockMember.mutateAsync({
        organizationId,
        userId: member.userId,
        action,
      });
    } catch {
      setActionError(
        'Không thể cập nhật trạng thái thành viên. Vui lòng thử lại.',
      );
    } finally {
      setPendingUserId(null);
    }
  }

  if (organizationQuery.isPending) {
    return (
      <p role="status" aria-live="polite">
        Đang tải tổ chức…
      </p>
    );
  }

  if (organizationQuery.isError) {
    return (
      <p role="alert" aria-live="polite" className="text-sm text-destructive">
        Không thể tải tổ chức. Vui lòng thử lại.
      </p>
    );
  }

  const organization = organizationQuery.data;
  const members = membersQuery.data?.members;
  const pendingInvites = membersQuery.data?.pendingInvites;
  const overallTotal = Math.max(
    members?.total ?? 0,
    pendingInvites?.total ?? 0,
  );
  const totalPages = Math.max(1, Math.ceil(overallTotal / MEMBER_PAGE_SIZE));
  const selectedStatusLabel =
    STATUS_OPTIONS.find((option) => option.value === status)?.label ?? 'Tất cả';

  return (
    <div className="space-y-6">
      <header>
        <Link
          to="/admin/organizations"
          className="rounded-md text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          ← Organizations
        </Link>
        <p className="mt-2 text-sm font-medium text-primary">ADMIN CONSOLE</p>
        <h1 className="mt-1 text-balance text-2xl font-semibold tracking-tight">
          {organization.name}
        </h1>
        <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <span className="font-mono text-xs" translate="no">
            {organization.id}
          </span>
          <span>
            · Tạo ngày {dateFormatter.format(new Date(organization.createdAt))}
          </span>
          <Badge
            variant={
              organization.status === 'LOCKED' ? 'destructive' : 'default'
            }
          >
            {organization.status}
          </Badge>
        </p>
      </header>

      <div className="flex flex-wrap items-end gap-2">
        <div>
          <Label htmlFor="member-search">Tìm tên hoặc email</Label>
          <Input
            id="member-search"
            name="member-search"
            value={searchInput}
            autoComplete="off"
            placeholder="VD: tên hoặc email…"
            className="w-64"
            onChange={(event) => handleSearchChange(event.target.value)}
          />
        </div>
        <div>
          <Label>Trạng thái thành viên</Label>
          <Select
            value={status}
            onValueChange={(next) =>
              setFilters(normalizeStatus(next), searchInput)
            }
          >
            <SelectTrigger aria-label="Trạng thái thành viên">
              <SelectValue>{selectedStatusLabel}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <section aria-labelledby="members-heading">
        <h2
          id="members-heading"
          className="flex items-center gap-2 text-lg font-semibold tracking-tight"
        >
          Thành viên
          <span className="text-sm font-normal text-muted-foreground">
            {members?.total ?? 0}
          </span>
        </h2>
        {membersQuery.isPending ? (
          <p role="status" aria-live="polite">
            Đang tải thành viên…
          </p>
        ) : membersQuery.isError ? (
          <div className="flex items-center gap-3">
            <p
              role="alert"
              aria-live="polite"
              className="text-sm text-destructive"
            >
              Không thể tải danh sách thành viên. Vui lòng thử lại.
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void membersQuery.refetch()}
            >
              Thử lại
            </Button>
          </div>
        ) : (members?.items.length ?? 0) === 0 ? (
          <p className="text-sm text-muted-foreground">Chưa có thành viên.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tên</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Vai trò</TableHead>
                <TableHead>Trạng thái</TableHead>
                <TableHead>Hành động</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {members?.items.map((member) => {
                const isBlocked = member.status === 'BLOCKED';
                return (
                  <TableRow key={member.id}>
                    <TableCell>
                      <span
                        className="block max-w-[18rem] truncate"
                        title={member.name}
                      >
                        {member.name}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span
                        className="block max-w-[18rem] truncate"
                        title={member.email}
                        translate="no"
                      >
                        {member.email}
                      </span>
                    </TableCell>
                    <TableCell>{ROLE_LABELS[member.role]}</TableCell>
                    <TableCell>
                      <Badge variant={isBlocked ? 'destructive' : 'default'}>
                        {isBlocked ? 'Bị chặn' : 'Hoạt động'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <BreakerSwitch
                            checked={isBlocked}
                            disabled={pendingUserId === member.userId}
                            onCheckedChange={() => undefined}
                            label={
                              isBlocked
                                ? `Bỏ chặn ${member.name}`
                                : `Chặn ${member.name}`
                            }
                          />
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>
                              {isBlocked
                                ? `Bỏ chặn ${member.name}?`
                                : `Chặn ${member.name}?`}
                            </AlertDialogTitle>
                            <AlertDialogDescription>
                              {member.role === 'OWNER' && !isBlocked
                                ? 'Đây là chủ sở hữu của tổ chức. Việc chặn có thể ảnh hưởng đến toàn bộ tổ chức.'
                                : isBlocked
                                  ? 'Thành viên sẽ có thể truy cập tổ chức trở lại.'
                                  : 'Thành viên sẽ không thể truy cập tổ chức cho đến khi được bỏ chặn.'}
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Hủy</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => void handleToggle(member)}
                            >
                              {isBlocked ? 'Xác nhận bỏ chặn' : 'Xác nhận chặn'}
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
      </section>

      <section aria-labelledby="invites-heading">
        <h2
          id="invites-heading"
          className="flex items-center gap-2 text-lg font-semibold tracking-tight"
        >
          Lời mời đang chờ
          <span className="text-sm font-normal text-muted-foreground">
            {pendingInvites?.total ?? 0}
          </span>
        </h2>
        {membersQuery.isPending ? (
          <p role="status" aria-live="polite">
            Đang tải lời mời…
          </p>
        ) : (pendingInvites?.items.length ?? 0) === 0 ? (
          <p className="text-sm text-muted-foreground">
            Chưa có lời mời đang chờ.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Email</TableHead>
                <TableHead>Vai trò</TableHead>
                <TableHead>Ngày mời</TableHead>
                <TableHead>Ngày hết hạn</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pendingInvites?.items.map((invite) => {
                const isExpired =
                  new Date(invite.expiresAt).getTime() < Date.now();
                return (
                  <TableRow key={invite.id}>
                    <TableCell>
                      <span
                        className="block max-w-[18rem] truncate"
                        title={invite.email}
                        translate="no"
                      >
                        {invite.email}
                      </span>
                    </TableCell>
                    <TableCell>{ROLE_LABELS[invite.role]}</TableCell>
                    <TableCell>
                      {dateFormatter.format(new Date(invite.invitedAt))}
                    </TableCell>
                    <TableCell>
                      <span className="flex items-center gap-2">
                        {dateFormatter.format(new Date(invite.expiresAt))}
                        {isExpired && (
                          <Badge variant="destructive">Đã hết hạn</Badge>
                        )}
                      </span>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </section>

      {overallTotal > 0 && (
        <footer className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
          <span className="tabular-nums">
            Trang {page} / {totalPages}
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
              disabled={page >= totalPages}
              onClick={() => setPage(page + 1)}
            >
              Sau
            </Button>
          </div>
        </footer>
      )}

      {actionError && (
        <p role="alert" aria-live="polite" className="text-sm text-destructive">
          {actionError}
        </p>
      )}
    </div>
  );
}
