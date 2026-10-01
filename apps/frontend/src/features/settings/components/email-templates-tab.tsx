import { Permission } from '@casso-ar/shared-types';
import { Mail } from 'lucide-react';
import { useState } from 'react';
import { EmptyState } from '@/components/layout/empty-state';
import { HeaderIcon } from '@/components/layout/header-icon';
import { SectionCard } from '@/components/layout/section-card';
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
  const [editingId, setEditingId] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState<EmailTemplate | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const editing =
    templatesQuery.data?.find((template) => template.id === editingId) ?? null;

  if (!canRead) return null;

  return (
    <SectionCard
      icon={Mail}
      title="Mẫu email"
      description="Quản lý nội dung email dùng trong các chính sách nhắc."
      action={
        canWrite && (
          <Button
            onClick={() => {
              setEditingId(null);
              setDialogOpen(true);
            }}
          >
            Tạo mẫu email
          </Button>
        )
      }
    >
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
        <EmptyState
          icon={Mail}
          title="Chưa có mẫu email"
          description="Tạo mẫu để dùng trong các chính sách nhắc."
          density="compact"
        />
      )}
      {templatesQuery.data && templatesQuery.data.length > 0 && (
        <Table className="block md:table">
          <TableHeader className="sr-only md:not-sr-only md:table-header-group">
            <TableRow>
              <TableHead>Tên</TableHead>
              <TableHead>Tiêu đề</TableHead>
              <TableHead>Loại</TableHead>
              {canWrite && <TableHead>Thao tác</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody className="block md:table-row-group">
            {templatesQuery.data.map((template) => (
              <TableRow
                key={template.id}
                className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 px-3 py-3 md:table-row md:px-0 md:py-0"
              >
                <TableCell className="col-span-2 min-w-0 max-w-56 break-words px-0 py-1 font-medium md:table-cell md:px-2 md:py-2">
                  <div className="flex items-center gap-2">
                    <HeaderIcon icon={Mail} />
                    {template.name}
                  </div>
                </TableCell>
                <TableCell className="col-span-2 flex min-w-0 max-w-72 flex-col gap-1 break-words px-0 py-1 md:table-cell md:px-2 md:py-2">
                  <span className="text-xs font-normal text-muted-foreground md:hidden">
                    Tiêu đề
                  </span>
                  {template.subject}
                </TableCell>
                <TableCell
                  className={`${canWrite ? '' : 'col-span-2'} flex flex-col items-start gap-1 px-0 py-1 md:table-cell md:px-2 md:py-2`}
                >
                  <span className="text-xs font-normal text-muted-foreground md:hidden">
                    Loại
                  </span>
                  <Badge variant={template.isDefault ? 'default' : 'outline'}>
                    {template.isDefault ? 'Mặc định' : 'Tùy chỉnh'}
                  </Badge>
                </TableCell>
                {canWrite && (
                  <TableCell className="min-w-0 px-0 py-1 text-right md:table-cell md:px-2 md:py-2">
                    <span className="mb-1 block text-xs font-normal text-muted-foreground md:hidden">
                      Thao tác
                    </span>
                    <div className="flex flex-wrap justify-end gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        aria-label="Xem trước mẫu email"
                        onClick={() => setPreviewing(template)}
                      >
                        Xem trước
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setEditingId(template.id);
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
    </SectionCard>
  );
}
