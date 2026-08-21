import { Permission } from '@casso-ledger/shared-types';
import { Mail } from 'lucide-react';
import { useState } from 'react';
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
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
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
import type { EmailTemplate } from '@/lib/use-email-templates';
import { useEmailTemplates } from '@/lib/use-email-templates';
import { useDeleteTemplate } from '../api/use-settings';
import { TemplateDialog } from './template-dialog';
import { TemplatePreviewDialog } from './template-preview-dialog';

export function EmailTemplatesTab() {
  const { user } = useAuth();
  const canRead = hasPermission(
    user?.role ?? null,
    Permission.EMAIL_TEMPLATE_READ,
  );
  const canWrite = hasPermission(
    user?.role ?? null,
    Permission.REMINDER_POLICY_WRITE,
  );
  const templatesQuery = useEmailTemplates(canRead);
  const deleteMutation = useDeleteTemplate();
  const [editing, setEditing] = useState<EmailTemplate | null>(null);
  const [previewing, setPreviewing] = useState<EmailTemplate | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  if (!canRead) return null;

  return (
    <Card className="animate-fade-up motion-reduce:animate-none">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Mail className="size-4 text-primary" />
          <CardTitle>Mẫu email</CardTitle>
        </div>
        <CardDescription>
          Quản lý nội dung email dùng trong các chính sách nhắc.
        </CardDescription>
        {canWrite && (
          <CardAction>
            <Button
              onClick={() => {
                setEditing(null);
                setDialogOpen(true);
              }}
            >
              Tạo mẫu email
            </Button>
          </CardAction>
        )}
      </CardHeader>
      <CardContent>
      {templatesQuery.isPending && (
        <p role="status" aria-live="polite">
          Đang tải mẫu email…
        </p>
      )}
      {templatesQuery.isError && (
        <p role="alert" aria-live="polite" className="text-destructive">
          Không thể tải mẫu email.
        </p>
      )}
      {templatesQuery.data && templatesQuery.data.length === 0 && (
        <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          Chưa có mẫu email.
        </p>
      )}
      {templatesQuery.data && templatesQuery.data.length > 0 && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Tên</TableHead>
              <TableHead>Tiêu đề</TableHead>
              <TableHead>Mặc định</TableHead>
              {canWrite && <TableHead>Thao tác</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {templatesQuery.data.map((template) => (
              <TableRow key={template.id}>
                <TableCell className="max-w-56 break-words font-medium">
                  {template.name}
                </TableCell>
                <TableCell className="max-w-72 break-words">
                  {template.subject}
                </TableCell>
                <TableCell>
                  {template.isDefault && <Badge>Mặc định</Badge>}
                </TableCell>
                {canWrite && (
                  <TableCell>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        aria-label="Preview template"
                        onClick={() => setPreviewing(template)}
                      >
                        Xem trước
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setEditing(template);
                          setDialogOpen(true);
                        }}
                      >
                        Sửa
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="destructive" size="sm">
                            Xóa
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Xóa mẫu email?</AlertDialogTitle>
                            <AlertDialogDescription>
                              Thao tác này không thể hoàn tác.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Hủy</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => deleteMutation.mutate(template.id)}
                            >
                              Xác nhận
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      {canWrite && (
        <>
          <TemplateDialog
            template={editing}
            open={dialogOpen}
            onOpenChange={setDialogOpen}
          />
          <TemplatePreviewDialog
            template={previewing}
            open={previewing !== null}
            onOpenChange={(open) => {
              if (!open) setPreviewing(null);
            }}
          />
        </>
      )}
      </CardContent>
    </Card>
  );
}
