import { INVITABLE_ROLES, Permission, Role } from '@casso-ar/shared-types';
import { Users } from 'lucide-react';
import { memo, useCallback, useEffect, useState } from 'react';
import { SectionCard } from '@/components/layout/section-card';
import { SectionHeading } from '@/components/layout/section-heading';
import { InitialsAvatar } from '@/components/shared/initials-avatar';
import {
  TruncatedName,
  TruncatedText,
} from '@/components/shared/truncated-text';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useAuth } from '@/contexts/auth-context';
import { hasPermission } from '@/lib/rbac';
import { ROLE_LABELS } from '@/lib/role-labels';
import {
  useBlockMember,
  useChangeMemberRole,
  useInviteMember,
  useOrganizationMembers,
  useRemoveMember,
  useUnblockMember,
} from '../api/use-settings';
import type { MembershipStatus, OrganizationMember } from '../types';
import { OwnershipTransferDialog } from './ownership-transfer-dialog';
import { PendingInvitesTable } from './pending-invites-table';
import { SettingsListPagination } from './settings-list-pagination';

const roles = Object.values(Role);

type StatusFilter = 'ALL' | MembershipStatus;

const roleSelectItems = INVITABLE_ROLES.map((item) => (
  <SelectItem key={item} value={item}>
    {ROLE_LABELS[item]}
  </SelectItem>
));

const statusFilterItems = (
  <>
    <SelectItem value="ALL">Tất cả</SelectItem>
    <SelectItem value="ACTIVE">Đang hoạt động</SelectItem>
    <SelectItem value="BLOCKED">Đã chặn</SelectItem>
  </>
);

const membersLoadingMessage = (
  <p role="status" aria-live="polite">
    Đang tải thành viên…
  </p>
);

const membersErrorMessage = (
  <p role="alert" aria-live="polite" className="text-destructive">
    Không thể tải thành viên.
  </p>
);

interface MembersTableProps {
  members: OrganizationMember[];
  emptyMessage: string;
  canManage: boolean;
  canBlock: boolean;
  currentUserId: string | null | undefined;
  onRoleChange: (userId: string, role: Role) => void;
  onRemove: (userId: string) => void;
  onBlock: (userId: string) => void;
  onUnblock: (userId: string) => void;
}

const MembersTable = memo(function MembersTable({
  members,
  emptyMessage,
  canManage,
  canBlock,
  currentUserId,
  onRoleChange,
  onRemove,
  onBlock,
  onUnblock,
}: MembersTableProps) {
  const showActions = canManage || canBlock;
  const colSpan = showActions ? 5 : 4;

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Tên</TableHead>
          <TableHead>Email</TableHead>
          <TableHead>Vai trò</TableHead>
          <TableHead>Trạng thái</TableHead>
          {showActions && <TableHead>Thao tác</TableHead>}
        </TableRow>
      </TableHeader>
      <TableBody>
        {members.length === 0 && (
          <TableRow>
            <TableCell
              colSpan={colSpan}
              className="text-center text-muted-foreground"
            >
              {emptyMessage}
            </TableCell>
          </TableRow>
        )}
        {members.map((member) => {
          const isSelf = member.userId === currentUserId;
          const isBlocked = member.status === 'BLOCKED';
          return (
            <TableRow key={member.id}>
              <TableCell>
                <div className="flex min-w-0 items-center gap-2">
                  <InitialsAvatar name={member.name} size="sm" />
                  <TruncatedName name={member.name} className="font-medium" />
                </div>
              </TableCell>
              <TableCell className="break-words">
                <TruncatedText value={member.email}>
                  {member.email}
                </TruncatedText>
              </TableCell>
              <TableCell>
                {canManage && !isSelf ? (
                  <Select
                    value={member.role}
                    onValueChange={(value) => {
                      const nextRole = roles.find((item) => item === value);
                      if (nextRole) onRoleChange(member.userId, nextRole);
                    }}
                  >
                    <SelectTrigger aria-label={`Vai trò của ${member.name}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>{roleSelectItems}</SelectContent>
                  </Select>
                ) : (
                  ROLE_LABELS[member.role]
                )}
              </TableCell>
              <TableCell>
                {isBlocked ? (
                  <Badge
                    variant="destructive"
                    className="animate-in fade-in zoom-in duration-150 ease-out motion-reduce:animate-none"
                  >
                    Đã chặn
                  </Badge>
                ) : (
                  <Badge className="bg-success/10 text-success">
                    Đang hoạt động
                  </Badge>
                )}
              </TableCell>
              {showActions && (
                <TableCell>
                  <div className="flex flex-wrap gap-2">
                    {canManage && !isSelf && (
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="destructive" size="sm">
                            Xoá {member.name}
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>
                              Xoá {member.name} khỏi tổ chức?
                            </AlertDialogTitle>
                            <AlertDialogDescription>
                              Người này sẽ mất quyền truy cập ngay lập tức. Thao
                              tác này không thể hoàn tác.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Hủy</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => onRemove(member.userId)}
                            >
                              Xác nhận
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    )}
                    {canBlock && !isSelf && (
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="outline" size="sm">
                            {isBlocked ? 'Bỏ chặn' : 'Chặn'} {member.name}
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>
                              {isBlocked
                                ? `Bỏ chặn ${member.name}?`
                                : `Chặn quyền truy cập của ${member.name}?`}
                            </AlertDialogTitle>
                            <AlertDialogDescription>
                              {isBlocked
                                ? 'Người này sẽ được khôi phục quyền truy cập vào tổ chức.'
                                : 'Người này sẽ mất quyền truy cập ngay lập tức. Bạn có thể bỏ chặn lại bất cứ lúc nào.'}
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Hủy</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() =>
                                isBlocked
                                  ? onUnblock(member.userId)
                                  : onBlock(member.userId)
                              }
                            >
                              Xác nhận
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    )}
                  </div>
                </TableCell>
              )}
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
});

export function UsersTab() {
  const { user } = useAuth();
  const canView =
    user?.role === Role.OWNER || user?.role === Role.FINANCE_MANAGER;
  const canInvite = hasPermission(user?.role ?? null, Permission.USER_MANAGE);
  const canManage = hasPermission(
    user?.role ?? null,
    Permission.ORGANIZATION_MANAGE,
  );
  const canBlock = hasPermission(user?.role ?? null, Permission.MEMBER_BLOCK);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>(Role.ACCOUNTANT);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [memberPage, setMemberPage] = useState(1);
  const [transferDialogOpen, setTransferDialogOpen] = useState(false);
  const isOwner = user?.role === Role.OWNER;
  const status = statusFilter === 'ALL' ? undefined : statusFilter;
  const membersQuery = useOrganizationMembers(
    canView ? user?.organizationId : undefined,
    memberPage,
    status,
    20,
  );
  const transferMembersQuery = useOrganizationMembers(
    isOwner && transferDialogOpen ? user?.organizationId : undefined,
    1,
    'ACTIVE',
    100,
  );
  const invite = useInviteMember();
  const changeRole = useChangeMemberRole(user?.organizationId);
  const removeMember = useRemoveMember(user?.organizationId);
  const blockMember = useBlockMember(user?.organizationId, memberPage, status);
  const unblockMember = useUnblockMember(
    user?.organizationId,
    memberPage,
    status,
  );

  useEffect(() => {
    const data = membersQuery.data;
    if (!data) return;
    const totalPages = Math.max(1, Math.ceil(data.total / data.limit));
    if (memberPage > totalPages) setMemberPage(totalPages);
  }, [memberPage, membersQuery.data]);
  const membersPageOutOfRange =
    membersQuery.data !== undefined &&
    memberPage >
      Math.max(1, Math.ceil(membersQuery.data.total / membersQuery.data.limit));

  const handleRoleChange = useCallback(
    (userId: string, nextRole: Role) => {
      changeRole.mutate({ userId, role: nextRole });
    },
    [changeRole],
  );

  const handleRemove = useCallback(
    (userId: string) => {
      removeMember.mutate(userId);
    },
    [removeMember],
  );

  const handleBlock = useCallback(
    (userId: string) => {
      blockMember.mutate(userId);
    },
    [blockMember],
  );

  const handleUnblock = useCallback(
    (userId: string) => {
      unblockMember.mutate(userId);
    },
    [unblockMember],
  );

  if (!canView) return null;

  function submit() {
    if (!user?.organizationId || !email.trim()) return;
    invite.mutate(
      { organizationId: user.organizationId, email: email.trim(), role },
      { onSuccess: () => setEmail('') },
    );
  }

  const members = membersQuery.data?.items ?? [];
  const transferCandidates = (transferMembersQuery.data?.items ?? [])
    .filter(
      (member) =>
        member.role !== Role.OWNER &&
        member.status === 'ACTIVE' &&
        member.joinedAt !== null,
    )
    .map((member) => ({
      userId: member.userId,
      name: member.name,
      email: member.email,
    }));

  const emptyMessage =
    statusFilter === 'ALL'
      ? 'Chưa có thành viên nào.'
      : 'Không có thành viên nào phù hợp với bộ lọc.';

  return (
    <div className="space-y-4">
      <SectionHeading
        icon={Users}
        title="Người dùng"
        description="Quản lý thành viên, vai trò và lời mời trong tổ chức."
      />
      <div className="space-y-6">
        {canInvite && (
          <div className="flex flex-wrap items-end gap-3 rounded-xl border bg-card p-4 shadow-sm">
            <label className="space-y-1 text-sm" htmlFor="invite-email">
              <span className="block">Email</span>
              <Input
                id="invite-email"
                name="email"
                type="email"
                autoComplete="email"
                spellCheck={false}
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="email@example.com"
              />
            </label>
            <div className="space-y-1 text-sm">
              <span className="block">Vai trò</span>
              <Select
                value={role}
                onValueChange={(value) => {
                  const nextRole = roles.find((item) => item === value);
                  if (nextRole) setRole(nextRole);
                }}
              >
                <SelectTrigger aria-label="Vai trò">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>{roleSelectItems}</SelectContent>
              </Select>
            </div>
            <Button
              disabled={!email.trim() || invite.isPending}
              onClick={submit}
            >
              {invite.isPending && <Spinner className="size-4" />}
              {invite.isPending ? 'Đang mời…' : 'Mời thành viên'}
            </Button>
          </div>
        )}
        {isOwner && (
          <OwnershipTransferDialog
            open={transferDialogOpen}
            onOpenChange={setTransferDialogOpen}
            organizationId={user.organizationId}
            candidates={transferCandidates}
          />
        )}
        <SectionCard
          icon={Users}
          title="Thành viên"
          action={
            <div className="flex items-center gap-2">
              {isOwner && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setTransferDialogOpen(true)}
                >
                  Chuyển quyền sở hữu
                </Button>
              )}
              <Select
                value={statusFilter}
                onValueChange={(value) => {
                  setStatusFilter(value as StatusFilter);
                  setMemberPage(1);
                }}
              >
                <SelectTrigger aria-label="Lọc theo trạng thái">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>{statusFilterItems}</SelectContent>
              </Select>
            </div>
          }
        >
          {membersQuery.isPending && membersLoadingMessage}
          {membersQuery.isError && membersErrorMessage}
          {membersPageOutOfRange && (
            <p role="status" aria-live="polite">
              Đang cập nhật danh sách thành viên…
            </p>
          )}
          {membersQuery.data && !membersPageOutOfRange && (
            <>
              <MembersTable
                members={members}
                emptyMessage={emptyMessage}
                canManage={canManage}
                canBlock={canBlock}
                currentUserId={user?.id}
                onRoleChange={handleRoleChange}
                onRemove={handleRemove}
                onBlock={handleBlock}
                onUnblock={handleUnblock}
              />
              <SettingsListPagination
                page={memberPage}
                total={membersQuery.data.total}
                limit={membersQuery.data.limit}
                label="thành viên"
                onPageChange={setMemberPage}
              />
            </>
          )}
        </SectionCard>
        {canManage && (
          <PendingInvitesTable organizationId={user?.organizationId} />
        )}
      </div>
    </div>
  );
}
