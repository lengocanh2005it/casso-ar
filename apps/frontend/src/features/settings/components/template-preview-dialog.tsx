import { useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { usePreviewTemplate } from '../api/use-settings';
import type { EmailTemplate } from '../types';

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
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Xem trước mẫu email</DialogTitle>
          <DialogDescription>{template?.name}</DialogDescription>
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
          <div className="space-y-3 rounded-lg border p-4">
            <h3 className="font-medium">{preview.data.subject}</h3>
            <iframe
              title="Email body preview"
              className="min-h-48 w-full rounded border"
              sandbox=""
              srcDoc={preview.data.bodyHtml}
            />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
