import { Permission, Role } from '@casso-ledger/shared-types';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
import { useInviteMember, useOrganizationMembers } from '../api/use-settings';

const roles = Object.values(Role);

export function UsersTab() {
  const { user } = useAuth();
  const canView =
    user?.role === Role.OWNER || user?.role === Role.FINANCE_MANAGER;
  const canInvite = hasPermission(user?.role ?? null, Permission.USER_MANAGE);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>(Role.ACCOUNTANT);
  const membersQuery = useOrganizationMembers(
    canView ? user?.organizationId : undefined,
  );
  const invite = useInviteMember();

  if (!canView) return null;

  function submit() {
    if (!user?.organizationId || !email.trim()) return;
    invite.mutate(
      { organizationId: user.organizationId, email: email.trim(), role },
      { onSuccess: () => setEmail('') },
    );
  }

  return (
    <div className="space-y-6">
      {canInvite && (
        <div className="flex flex-wrap items-end gap-2">
          <label className="space-y-1 text-sm" htmlFor="invite-email">
            <span className="block">Email</span>
            <Input
              id="invite-email"
              type="email"
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
              onChange={(event) => setRole(event.target.value as Role)}
            >
              {roles.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>
          <Button disabled={!email.trim() || invite.isPending} onClick={submit}>
            Mời thành viên
          </Button>
        </div>
      )}
      <div>
        <h2 className="mb-3 text-lg font-semibold">Thành viên</h2>
        {membersQuery.isPending && <p>Đang tải thành viên…</p>}
        {membersQuery.isError && (
          <p className="text-destructive">Không thể tải thành viên.</p>
        )}
        {membersQuery.data && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tên</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Vai trò</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {membersQuery.data.items.map((member) => (
                <TableRow key={member.id}>
                  <TableCell>{member.name}</TableCell>
                  <TableCell>{member.email}</TableCell>
                  <TableCell>{member.role}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}
