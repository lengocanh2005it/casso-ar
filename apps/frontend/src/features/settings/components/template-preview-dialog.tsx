import { useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { createEmailPreviewDocument } from '@/lib/email-preview-document';
import type { EmailTemplate } from '@/lib/use-email-templates';
import { usePreviewTemplate } from '../api/use-settings';

export function TemplatePreviewDialog({
  template,
  open,
  onOpenChange,
}: {
  template: EmailTemplate | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const preview = usePreviewTemplate();

  useEffect(() => {
    if (open && template) preview.mutate(template.id);
  }, [open, template, preview.mutate]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader className="min-w-0">
          <DialogTitle>Xem trước mẫu email</DialogTitle>
          <DialogDescription
            className="min-w-0 truncate"
            title={template?.name ?? '—'}
          >
            {template?.name ?? '—'}
          </DialogDescription>
        </DialogHeader>
        {preview.isPending && (
          <p role="status" aria-live="polite">
            Đang tạo bản xem trước…
          </p>
        )}
        {preview.isError && (
          <p role="alert" aria-live="polite" className="text-destructive">
            Không thể xem trước mẫu email.
          </p>
        )}
        {preview.data && (
          <div className="min-w-0 overflow-hidden rounded-md border bg-background shadow-sm">
            <div className="border-b bg-muted/30 px-5 py-4">
              <h3 className="truncate font-medium" title={preview.data.subject}>
                {preview.data.subject}
              </h3>
            </div>
            <iframe
              title="Bản xem trước nội dung email"
              className="block h-[min(60vh,560px)] w-full bg-white"
              sandbox=""
              srcDoc={createEmailPreviewDocument(preview.data.bodyHtml)}
            />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
