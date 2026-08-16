import { useEffect, useState } from 'react';
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
import { useCreateTemplate, useUpdateTemplate } from '../api/use-settings';
import type { EmailTemplate } from '../types';

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
          <Label className="space-y-1">
            <span>Tên mẫu</span>
            <Input
              name="name"
              autoComplete="off"
              value={name}
              disabled={Boolean(template)}
              onChange={(event) => setName(event.target.value)}
            />
          </Label>
          <Label className="space-y-1">
            <span>Tiêu đề</span>
            <Input
              name="subject"
              autoComplete="off"
              value={subject}
              onChange={(event) => setSubject(event.target.value)}
            />
          </Label>
          <Label className="space-y-1">
            <span>Nội dung HTML</span>
            <Textarea
              name="bodyHtml"
              rows={8}
              value={bodyHtml}
              onChange={(event) => setBodyHtml(event.target.value)}
            />
          </Label>
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
