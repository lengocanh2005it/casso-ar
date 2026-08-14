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
import { useUpdateCopilotDraft } from '../api/use-copilot-drafts';
import type { CopilotDraft } from '../types';

export function DraftEditDialog({
  draft,
  open,
  onOpenChange,
}: {
  draft: CopilotDraft | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [subject, setSubject] = useState('');
  const [bodyHtml, setBodyHtml] = useState('');
  const update = useUpdateCopilotDraft();

  useEffect(() => {
    if (!open) return;
    setSubject(draft?.subject ?? '');
    setBodyHtml(draft?.bodyHtml ?? '');
  }, [open, draft]);

  function submit() {
    if (!draft) return;
    if (!subject.trim() || !bodyHtml.trim()) {
      toast.error('Vui lòng nhập đầy đủ tiêu đề và nội dung.');
      return;
    }
    update.mutate(
      { id: draft.id, input: { subject, bodyHtml } },
      {
        onSuccess: () => {
          toast.success('Đã cập nhật bản nháp.');
          onOpenChange(false);
        },
        onError: () => toast.error('Không thể cập nhật bản nháp.'),
      },
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Sửa bản nháp email</DialogTitle>
          <DialogDescription>
            Chỉnh sửa tiêu đề và nội dung của bản nháp email nhắc thanh toán.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <Label className="space-y-1">
            <span>Tiêu đề</span>
            <Input
              value={subject}
              onChange={(event) => setSubject(event.target.value)}
            />
          </Label>
          <Label className="space-y-1">
            <span>Nội dung HTML</span>
            <Textarea
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
          <Button disabled={update.isPending} onClick={submit}>
            {update.isPending ? 'Đang lưu…' : 'Lưu'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
