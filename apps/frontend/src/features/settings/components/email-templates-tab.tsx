import { Permission } from '@casso-ledger/shared-types';
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
import { useAuth } from '@/contexts/auth-context';
import { hasPermission } from '@/lib/rbac';
import { useDeleteTemplate, useEmailTemplates } from '../api/use-settings';
import type { EmailTemplate } from '../types';
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
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">Mẫu email</h2>
          <p className="text-sm text-muted-foreground">
            Quản lý nội dung email dùng trong các chính sách nhắc.
          </p>
        </div>
        {canWrite && (
          <Button
            onClick={() => {
              setEditing(null);
              setDialogOpen(true);
            }}
          >
            Tạo mẫu email
          </Button>
        )}
      </div>
      {templatesQuery.isPending && <p>Đang tải mẫu email…</p>}
      {templatesQuery.isError && (
        <p className="text-destructive">Không thể tải mẫu email.</p>
      )}
      {templatesQuery.data && templatesQuery.data.length === 0 && (
        <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          Chưa có mẫu email.
        </p>
      )}
      {templatesQuery.data && templatesQuery.data.length > 0 && (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left">
              <th className="p-2">Tên</th>
              <th className="p-2">Tiêu đề</th>
              <th className="p-2">Mặc định</th>
              {canWrite && <th className="p-2">Thao tác</th>}
            </tr>
          </thead>
          <tbody>
            {templatesQuery.data.map((template) => (
              <tr className="border-b" key={template.id}>
                <td className="p-2 font-medium">{template.name}</td>
                <td className="p-2">{template.subject}</td>
                <td className="p-2">
                  {template.isDefault && <Badge>Mặc định</Badge>}
                </td>
                {canWrite && (
                  <td className="flex gap-2 p-2">
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
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
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
    </div>
  );
}
