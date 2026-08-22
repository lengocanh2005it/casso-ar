import type { FormEvent } from 'react';
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
  const [validationError, setValidationError] = useState<string | null>(null);
  const [invalidField, setInvalidField] = useState<
    'subject' | 'bodyHtml' | null
  >(null);
  const subjectRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const update = useUpdateCopilotDraft();

  useEffect(() => {
    if (!open) return;
    setSubject(draft?.subject ?? '');
    setBodyHtml(draft?.bodyHtml ?? '');
    setValidationError(null);
    setInvalidField(null);
  }, [open, draft]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft) return;

    if (!subject.trim()) {
      setValidationError('Vui lòng nhập tiêu đề trước khi lưu.');
      setInvalidField('subject');
      subjectRef.current?.focus();
      return;
    }
    if (!bodyHtml.trim()) {
      setValidationError('Vui lòng nhập nội dung HTML trước khi lưu.');
      setInvalidField('bodyHtml');
      bodyRef.current?.focus();
      return;
    }

    setValidationError(null);
    setInvalidField(null);
    update.mutate(
      { id: draft.id, input: { subject, bodyHtml } },
      {
        onSuccess: () => {
          toast.success('Đã cập nhật bản nháp.');
          onOpenChange(false);
        },
        onError: () =>
          toast.error('Không thể cập nhật bản nháp. Vui lòng thử lại.'),
      },
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="overscroll-contain">
        <DialogHeader>
          <DialogTitle>Sửa bản nháp email</DialogTitle>
          <DialogDescription>
            Chỉnh sửa tiêu đề và nội dung của bản nháp email nhắc thanh toán.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit}>
          <div className="space-y-4">
            <Label className="block space-y-2">
              <span className="block">Tiêu đề</span>
              <Input
                ref={subjectRef}
                name="subject"
                autoComplete="off"
                aria-invalid={invalidField === 'subject'}
                aria-describedby={
                  validationError ? 'draft-edit-error' : undefined
                }
                value={subject}
                onChange={(event) => {
                  setSubject(event.target.value);
                  if (invalidField === 'subject') {
                    setInvalidField(null);
                    setValidationError(null);
                  }
                }}
              />
            </Label>
            <Label className="block space-y-2">
              <span className="block">Nội dung HTML</span>
              <Textarea
                ref={bodyRef}
                name="bodyHtml"
                autoComplete="off"
                aria-invalid={invalidField === 'bodyHtml'}
                aria-describedby={
                  validationError ? 'draft-edit-error' : undefined
                }
                rows={8}
                value={bodyHtml}
                onChange={(event) => {
                  setBodyHtml(event.target.value);
                  if (invalidField === 'bodyHtml') {
                    setInvalidField(null);
                    setValidationError(null);
                  }
                }}
              />
            </Label>
            {validationError && (
              <p
                id="draft-edit-error"
                role="alert"
                aria-live="polite"
                className="text-sm text-destructive"
              >
                {validationError}
              </p>
            )}
          </div>
          <DialogFooter className="mt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Hủy
            </Button>
            <Button type="submit" disabled={update.isPending}>
              {update.isPending ? 'Đang lưu…' : 'Lưu'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
