import { MailPlus } from 'lucide-react';
import { EmptyState } from '@/components/layout/empty-state';
import { SectionCard } from '@/components/layout/section-card';
import { InviteResendButton } from '@/components/shared/invite-resend-button';
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
import { ROLE_LABELS } from '@/lib/role-labels';
import { buildInvitationCooldownKey } from '@/lib/use-resend-cooldown';
import {
  useOrganizationInvites,
  useResendInvite,
  useRevokeInvite,
} from '../api/use-settings';

export function PendingInvitesTable({
  organizationId,
}: {
  organizationId: string | undefined;
}) {
  const invitesQuery = useOrganizationInvites(organizationId);
  const resend = useResendInvite(organizationId);
  const revoke = useRevokeInvite(organizationId);

  return (
    <SectionCard
      icon={MailPlus}
      title="Lời mời đang chờ"
      className="[animation-delay:40ms]"
    >
      {invitesQuery.isPending && (
        <p role="status" aria-live="polite">
          Đang tải lời mời…
        </p>
      )}
      {invitesQuery.isError && (
        <p role="alert" aria-live="polite" className="text-destructive">
          Không thể tải lời mời.
        </p>
      )}
      {invitesQuery.data && invitesQuery.data.items.length === 0 && (
        <EmptyState
          icon={MailPlus}
          title="Không có lời mời nào đang chờ."
          description="Lời mời thành viên mới sẽ xuất hiện tại đây."
          density="compact"
        />
      )}
      {invitesQuery.data && invitesQuery.data.items.length > 0 && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Email</TableHead>
              <TableHead>Vai trò</TableHead>
              <TableHead>Mời lúc</TableHead>
              <TableHead>Thao tác</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {invitesQuery.data.items.map((invite) => (
              <TableRow key={invite.id}>
                <TableCell className="max-w-64 break-words">
                  {invite.email}
                </TableCell>
                <TableCell>{ROLE_LABELS[invite.role]}</TableCell>
                <TableCell>
                  {new Intl.DateTimeFormat('vi-VN').format(
                    new Date(invite.invitedAt),
                  )}
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-2">
                    <InviteResendButton
                      cooldownKey={buildInvitationCooldownKey(
                        organizationId ?? '',
                        invite.email,
                      )}
                      onResend={() => resend.mutateAsync(invite.id)}
                    />
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="destructive" size="sm">
                          Thu hồi
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>
                            Thu hồi lời mời tới {invite.email}?
                          </AlertDialogTitle>
                          <AlertDialogDescription>
                            Lời mời sẽ không còn hiệu lực.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Hủy</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => revoke.mutate(invite.id)}
                          >
                            Xác nhận
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </SectionCard>
  );
}
