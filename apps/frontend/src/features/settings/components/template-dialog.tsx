import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import type { EmailTemplate } from '@/lib/use-email-templates';
import {
  useCreateTemplate,
  useDeleteTemplateAttachment,
  useUpdateTemplate,
  useUploadTemplateAttachment,
} from '../api/use-settings';

export function TemplateDialog({
  template,
  open,
  onOpenChange,
}: {
  template: EmailTemplate | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [name, setName] = useState('');
  const [subject, setSubject] = useState('');
  const [bodyHtml, setBodyHtml] = useState('');
  const create = useCreateTemplate();
  const update = useUpdateTemplate();
  const uploadAttachment = useUploadTemplateAttachment();
  const deleteAttachment = useDeleteTemplateAttachment();
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setName(template?.name ?? '');
    setSubject(template?.subject ?? '');
    setBodyHtml(template?.bodyHtml ?? '');
  }, [open, template]);

  function submit() {
    if (!name.trim() || !subject.trim() || !bodyHtml.trim()) {
      toast.error('Vui lòng nhập đầy đủ thông tin mẫu email.');
      return;
    }
    if (template) {
      update.mutate(
        { id: template.id, input: { subject, bodyHtml } },
        { onSuccess: () => onOpenChange(false) },
      );
    } else {
      create.mutate(
        { name, subject, bodyHtml },
        { onSuccess: () => onOpenChange(false) },
      );
    }
  }

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file || !template) return;
    uploadAttachment.mutate(
      { templateId: template.id, file },
      {
        onSettled: () => {
          if (fileInputRef.current) fileInputRef.current.value = '';
        },
      },
    );
  }

  const pending = create.isPending || update.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {template ? 'Sửa mẫu email' : 'Tạo mẫu email'}
          </DialogTitle>
          <DialogDescription>
            Dùng cú pháp biến như {'{{customerName}}'} trong nội dung email.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <Label className="block space-y-2">
            <span className="block">Tên mẫu</span>
            <Input
              name="name"
              autoComplete="off"
              value={name}
              disabled={Boolean(template)}
              onChange={(event) => setName(event.target.value)}
            />
          </Label>
          <Label className="block space-y-2">
            <span className="block">Tiêu đề</span>
            <Input
              name="subject"
              autoComplete="off"
              value={subject}
              onChange={(event) => setSubject(event.target.value)}
            />
          </Label>
          <Label className="block space-y-2">
            <span className="block">Nội dung HTML</span>
            <Textarea
              name="bodyHtml"
              rows={8}
              value={bodyHtml}
              onChange={(event) => setBodyHtml(event.target.value)}
            />
          </Label>
          {template && (
            <div className="space-y-2">
              <span className="text-sm font-medium">File đính kèm</span>
              <ul className="space-y-1">
                {template.attachments.map((attachment) => (
                  <li
                    key={attachment.id}
                    className="flex items-center justify-between text-sm"
                  >
                    <span>{attachment.filename}</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={deleteAttachment.isPending}
                      onClick={() =>
                        deleteAttachment.mutate({
                          templateId: template.id,
                          attachmentId: attachment.id,
                        })
                      }
                    >
                      Xoá
                    </Button>
                  </li>
                ))}
              </ul>
              <input
                ref={fileInputRef}
                type="file"
                accept="application/pdf,image/png,image/jpeg"
                disabled={uploadAttachment.isPending}
                onChange={handleFileChange}
              />
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Hủy
          </Button>
          <Button disabled={pending} onClick={submit}>
            {pending ? 'Đang lưu…' : 'Lưu mẫu'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
