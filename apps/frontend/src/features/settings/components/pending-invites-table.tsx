import { MailPlus } from 'lucide-react';
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
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
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
    <Card className="animate-fade-up motion-reduce:animate-none [animation-delay:40ms]">
      <CardHeader>
        <div className="flex items-center gap-2">
          <MailPlus className="size-4 text-primary" />
          <CardTitle>Lời mời đang chờ</CardTitle>
        </div>
      </CardHeader>
      <CardContent>
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
        <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          Không có lời mời nào đang chờ.
        </p>
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
                <TableCell>{invite.role}</TableCell>
                <TableCell>
                  {new Intl.DateTimeFormat('vi-VN').format(
                    new Date(invite.invitedAt),
                  )}
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={resend.isPending}
                      onClick={() => resend.mutate(invite.id)}
                    >
                      Gửi lại
                    </Button>
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
      </CardContent>
    </Card>
  );
}
