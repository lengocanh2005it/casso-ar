import { Permission, Role } from '@casso-ledger/shared-types';
import { useState } from 'react';
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
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
import {
  useBlockMember,
  useChangeMemberRole,
  useInviteMember,
  useOrganizationMembers,
  useRemoveMember,
  useUnblockMember,
} from '../api/use-settings';
import type { MembershipStatus } from '../types';
import { PendingInvitesTable } from './pending-invites-table';

const roles = Object.values(Role);

type StatusFilter = 'ALL' | MembershipStatus;

function parseStatusFilter(value: string | null): StatusFilter {
  return value === 'ACTIVE' || value === 'BLOCKED' ? value : 'ALL';
}

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
  const [searchParams, setSearchParams] = useSearchParams();
  const statusFilter = parseStatusFilter(searchParams.get('status'));
  const membersQuery = useOrganizationMembers(
    canView ? user?.organizationId : undefined,
  );
  const invite = useInviteMember();
  const changeRole = useChangeMemberRole(user?.organizationId);
  const removeMember = useRemoveMember(user?.organizationId);
  const blockMember = useBlockMember(user?.organizationId);
  const unblockMember = useUnblockMember(user?.organizationId);

  if (!canView) return null;

  function submit() {
    if (!user?.organizationId || !email.trim()) return;
    invite.mutate(
      { organizationId: user.organizationId, email: email.trim(), role },
      { onSuccess: () => setEmail('') },
    );
  }

  function changeStatusFilter(value: StatusFilter) {
    const next = new URLSearchParams(searchParams);
    if (value === 'ALL') next.delete('status');
    else next.set('status', value);
    setSearchParams(next, { replace: true });
  }

  const members = membersQuery.data?.items ?? [];
  const filteredMembers =
    statusFilter === 'ALL'
      ? members
      : members.filter((member) => member.status === statusFilter);

  const colSpan = canManage || canBlock ? 5 : 4;

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
          <label className="space-y-1 text-sm" htmlFor="invite-role">
            <span className="block">Vai trò</span>
            <select
              id="invite-role"
              className="h-9 rounded-md border bg-background px-3 text-sm"
              value={role}
              onChange={(event) => {
                const nextRole = roles.find(
                  (item) => item === event.target.value,
                );
                if (nextRole) setRole(nextRole);
              }}
            >
              {roles.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>
          <Button disabled={!email.trim() || invite.isPending} onClick={submit}>
            {invite.isPending && <Spinner className="size-4" />}
            {invite.isPending ? 'Đang mời…' : 'Mời thành viên'}
          </Button>
        </div>
      )}
      <div>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">Thành viên</h2>
          <select
            aria-label="Lọc theo trạng thái"
            className="h-9 rounded-md border bg-background px-3 text-sm"
            value={statusFilter}
            onChange={(event) =>
              changeStatusFilter(event.target.value as StatusFilter)
            }
          >
            <option value="ALL">Tất cả</option>
            <option value="ACTIVE">Đang hoạt động</option>
            <option value="BLOCKED">Đã chặn</option>
          </select>
        </div>
        {membersQuery.isPending && (
          <p aria-live="polite">Đang tải thành viên…</p>
        )}
        {membersQuery.isError && (
          <p aria-live="polite" className="text-destructive">
            Không thể tải thành viên.
          </p>
        )}
        {membersQuery.data && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tên</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Vai trò</TableHead>
                <TableHead>Trạng thái</TableHead>
                {(canManage || canBlock) && <TableHead>Thao tác</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredMembers.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={colSpan}
                    className="text-center text-muted-foreground"
                  >
                    {members.length === 0
                      ? 'Chưa có thành viên nào.'
                      : 'Không có thành viên nào phù hợp với bộ lọc.'}
                  </TableCell>
                </TableRow>
              )}
              {filteredMembers.map((member) => {
                const isSelf = member.userId === user?.id;
                const isBlocked = member.status === 'BLOCKED';
                return (
                  <TableRow key={member.id}>
                    <TableCell className="break-words">{member.name}</TableCell>
                    <TableCell className="break-words">
                      {member.email}
                    </TableCell>
                    <TableCell>
                      {canManage && !isSelf ? (
                        <select
                          aria-label={`Vai trò của ${member.name}`}
                          className="h-9 rounded-md border bg-background px-3 text-sm"
                          value={member.role}
                          onChange={(event) => {
                            const nextRole = roles.find(
                              (item) => item === event.target.value,
                            );
                            if (nextRole) {
                              changeRole.mutate({
                                userId: member.userId,
                                role: nextRole,
                              });
                            }
                          }}
                        >
                          {roles.map((item) => (
                            <option key={item} value={item}>
                              {item}
                            </option>
                          ))}
                        </select>
                      ) : (
                        member.role
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
                    {(canManage || canBlock) && (
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
                                  Người này sẽ mất quyền truy cập ngay lập tức.
                                  Thao tác này không thể hoàn tác.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Hủy</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() =>
                                    removeMember.mutate(member.userId)
                                  }
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
                                      ? unblockMember.mutate(member.userId)
                                      : blockMember.mutate(member.userId)
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
        )}
      </div>
      {canManage && (
        <PendingInvitesTable organizationId={user?.organizationId} />
      )}
    </div>
  );
}
