import type { Role } from '@casso-ledger/shared-types';
import { Users } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { TableSkeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useUrlQueryParams } from '@/lib/use-url-query-params';
import type {
  AdminMemberItem,
  AdminMemberStatusFilter,
} from '../api/admin-api';
import {
  useAdminOrganization,
  useBlockOrganizationMember,
  useOrganizationMembers,
  useResendOrganizationInvite,
  useRevokeOrganizationInvite,
} from '../api/use-admin';
import { BreakerSwitch } from '../components/breaker-switch';
import { ORGANIZATION_STATUS_LABELS } from '../lib/organization-status-labels';

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
  const { searchParams, setPage, patch } = useUrlQueryParams();

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
  const resendInvite = useResendOrganizationInvite();
  const revokeInvite = useRevokeOrganizationInvite();
  const [pendingUserId, setPendingUserId] = useState<string | null>(null);
  const [activeInviteId, setActiveInviteId] = useState<string | null>(null);
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
    patch((next) => {
      next.set('status', nextStatus);
      if (nextSearch) {
        next.set('search', nextSearch);
      } else {
        next.delete('search');
      }
      next.delete('page');
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

  async function handleResendInvite(inviteId: string) {
    setActiveInviteId(inviteId);
    setActionError(null);
    try {
      await resendInvite.mutateAsync({ organizationId, inviteId });
    } catch {
      setActionError('Không thể gửi lại lời mời. Vui lòng thử lại.');
    } finally {
      setActiveInviteId(null);
    }
  }

  async function handleRevokeInvite(inviteId: string) {
    setActiveInviteId(inviteId);
    setActionError(null);
    try {
      await revokeInvite.mutateAsync({ organizationId, inviteId });
    } catch {
      setActionError('Không thể thu hồi lời mời. Vui lòng thử lại.');
    } finally {
      setActiveInviteId(null);
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
      <PageHeading
        eyebrow="QUẢN LÝ TỔ CHỨC"
        title={organization.name}
        icon={Users}
        tone="info"
        description={
          <span className="flex flex-wrap items-center gap-2">
            <Link
              to="/admin/organizations"
              className="rounded-md text-muted-foreground transition-colors duration-150 ease-out motion-reduce:transition-none pointer-hover:hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              ← Tổ chức
            </Link>
            <TruncatedCopyId id={organization.id} />
            <span>
              · Tạo ngày{' '}
              {dateFormatter.format(new Date(organization.createdAt))}
            </span>
            <Badge
              variant={
                organization.status === 'LOCKED' ? 'destructive' : 'default'
              }
            >
              {ORGANIZATION_STATUS_LABELS[organization.status]}
            </Badge>
          </span>
        }
      />

      <div className="flex flex-wrap items-end gap-2 rounded-xl border bg-card p-4">
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
          <TableSkeleton rows={5} />
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
          <div className="overflow-hidden rounded-xl border bg-card">
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
                                {isBlocked
                                  ? 'Xác nhận bỏ chặn'
                                  : 'Xác nhận chặn'}
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
          </div>
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
          <TableSkeleton rows={3} />
        ) : membersQuery.isError ? (
          <p
            role="alert"
            aria-live="polite"
            className="text-sm text-destructive"
          >
            Không thể tải lời mời đang chờ. Vui lòng thử lại.
          </p>
        ) : (pendingInvites?.items.length ?? 0) === 0 ? (
          <p className="text-sm text-muted-foreground">
            Chưa có lời mời đang chờ.
          </p>
        ) : (
          <div className="overflow-hidden rounded-xl border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Vai trò</TableHead>
                  <TableHead>Ngày mời</TableHead>
                  <TableHead>Ngày hết hạn</TableHead>
                  <TableHead>Hành động</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pendingInvites?.items.map((invite) => {
                  const isExpired =
                    new Date(invite.expiresAt).getTime() < Date.now();
                  const isActive = activeInviteId === invite.id;
                  const isResending = isActive && resendInvite.isPending;
                  const isRevoking = isActive && revokeInvite.isPending;
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
                      <TableCell>
                        <div className="flex flex-wrap gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            className="min-w-32"
                            disabled={isActive}
                            aria-busy={isResending}
                            onClick={() => void handleResendInvite(invite.id)}
                          >
                            {isResending ? 'Đang gửi lại…' : 'Gửi lại'}
                          </Button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button
                                variant="destructive"
                                size="sm"
                                className="min-w-32"
                                disabled={isActive}
                                aria-busy={isRevoking}
                              >
                                {isRevoking ? 'Đang thu hồi…' : 'Thu hồi'}
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>
                                  Thu hồi lời mời tới{' '}
                                  <span translate="no">{invite.email}</span>?
                                </AlertDialogTitle>
                                <AlertDialogDescription>
                                  Lời mời sẽ mất hiệu lực và không thể được chấp
                                  nhận.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Hủy</AlertDialogCancel>
                                <AlertDialogAction
                                  disabled={isActive}
                                  onClick={() =>
                                    void handleRevokeInvite(invite.id)
                                  }
                                >
                                  Xác nhận thu hồi
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </section>

      {overallTotal > 0 && (
        <footer className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
          <span className="tabular-nums">
            Trang {page} / {totalPages}
          </span>
          <div className="flex flex-wrap gap-2">
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
