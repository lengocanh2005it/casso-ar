import { Permission, Role } from '@casso-ledger/shared-types';
import { Users } from 'lucide-react';
import { memo, useCallback, useState } from 'react';
import { SectionCard } from '@/components/layout/section-card';
import { InitialsAvatar } from '@/components/shared/initials-avatar';
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
import { PendingInvitesTable } from './pending-invites-table';

const roles = Object.values(Role);

type StatusFilter = 'ALL' | MembershipStatus;

const roleSelectItems = roles.map((item) => (
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
              <TableCell className="break-words">
                <div className="flex items-center gap-2">
                  <InitialsAvatar name={member.name} size="sm" />
                  {member.name}
                </div>
              </TableCell>
              <TableCell className="break-words">{member.email}</TableCell>
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
                {isBlocked && (
                  <Badge
                    variant="destructive"
                    className="animate-in fade-in zoom-in duration-150 ease-out motion-reduce:animate-none"
                  >
                    Đã chặn
                  </Badge>
                )}
              </TableCell>
              {showActions && (
                <TableCell className="space-x-2">
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
  const membersQuery = useOrganizationMembers(
    canView ? user?.organizationId : undefined,
  );
  const invite = useInviteMember();
  const changeRole = useChangeMemberRole(user?.organizationId);
  const removeMember = useRemoveMember(user?.organizationId);
  const blockMember = useBlockMember(user?.organizationId);
  const unblockMember = useUnblockMember(user?.organizationId);

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
  const filteredMembers =
    statusFilter === 'ALL'
      ? members
      : members.filter((member) => member.status === statusFilter);
  const emptyMessage =
    members.length === 0
      ? 'Chưa có thành viên nào.'
      : 'Không có thành viên nào phù hợp với bộ lọc.';

  return (
    <div className="space-y-6">
      {canInvite && (
        <div className="flex flex-wrap items-end gap-2">
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
          <Button disabled={!email.trim() || invite.isPending} onClick={submit}>
            {invite.isPending && <Spinner className="size-4" />}
            {invite.isPending ? 'Đang mời…' : 'Mời thành viên'}
          </Button>
        </div>
      )}
      <SectionCard
        icon={Users}
        title="Thành viên"
        action={
          <Select
            value={statusFilter}
            onValueChange={(value) => setStatusFilter(value as StatusFilter)}
          >
            <SelectTrigger aria-label="Lọc theo trạng thái">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>{statusFilterItems}</SelectContent>
          </Select>
        }
      >
        {membersQuery.isPending && membersLoadingMessage}
        {membersQuery.isError && membersErrorMessage}
        {membersQuery.data && (
          <MembersTable
            members={filteredMembers}
            emptyMessage={emptyMessage}
            canManage={canManage}
            canBlock={canBlock}
            currentUserId={user?.id}
            onRoleChange={handleRoleChange}
            onRemove={handleRemove}
            onBlock={handleBlock}
            onUnblock={handleUnblock}
          />
        )}
      </SectionCard>
      {canManage && (
        <PendingInvitesTable organizationId={user?.organizationId} />
      )}
    </div>
  );
}
