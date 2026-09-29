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

const SAMPLE_RENDER_DATA: Record<string, string> = {
  customerName: 'ABC Company Ltd.',
  invoiceNumber: 'INV-2026-0088',
  originalAmount: '50000000',
  remainingAmount: '20000000',
  dueDate: '2026-08-10',
  daysOverdue: '5',
  organizationName: 'Casso AR Demo',
};

const TEMPLATE_VARIABLES = [
  { name: 'customerName', label: 'Tên khách hàng' },
  { name: 'invoiceNumber', label: 'Số hóa đơn' },
  { name: 'originalAmount', label: 'Giá trị hóa đơn' },
  { name: 'remainingAmount', label: 'Còn phải thu' },
  { name: 'dueDate', label: 'Hạn thanh toán' },
  { name: 'daysOverdue', label: 'Số ngày quá hạn' },
  { name: 'organizationName', label: 'Tên công ty bạn' },
] as const;

const HTML_ENTITIES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#x27;',
};

function renderSampleVariables(value: string): string {
  return value.replace(
    /(?<!\{)\{\{\s*([A-Za-z]\w*)\s*\}\}(?!\})/g,
    (token, name: string) => {
      const sample = Object.hasOwn(SAMPLE_RENDER_DATA, name)
        ? SAMPLE_RENDER_DATA[name]
        : undefined;
      return sample === undefined
        ? token
        : sample.replace(/[&<>"']/g, (character) => HTML_ENTITIES[character]);
    },
  );
}

function createPreviewDocument(bodyHtml: string): string {
  const content = bodyHtml.trim()
    ? bodyHtml
    : '<p style="color:#64748b">Nội dung email sẽ hiển thị ở đây.</p>';

  return `<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; font-src data:; base-uri 'none'; form-action 'none'; object-src 'none'"><style>html,body{margin:0;min-height:100%;background:#fff}body{font:15px/1.65 Arial,sans-serif;color:#1f2937}.email-content{padding:24px;overflow-wrap:anywhere}.email-content img{max-width:100%;height:auto}</style></head><body><main class="email-content">${content}</main></body></html>`;
}

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
  }, [open, template?.name, template?.subject, template?.bodyHtml]);

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
  const previewSubject = renderSampleVariables(subject);
  const previewBody = renderSampleVariables(bodyHtml);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[min(92dvh,880px)] max-h-[92dvh] w-[calc(100vw-2rem)] max-w-[1280px] flex-col gap-0 overflow-hidden p-0 sm:max-w-[1280px]">
        <DialogHeader className="shrink-0 border-b px-5 py-4 pr-12 sm:px-7 sm:py-5 sm:pr-14">
          <DialogTitle className="text-xl">
            {template ? 'Sửa mẫu email' : 'Tạo mẫu email'}
          </DialogTitle>
          <DialogDescription>
            Soạn nội dung và xem ngay email với dữ liệu minh họa.
          </DialogDescription>
        </DialogHeader>

        <div className="grid min-h-0 flex-1 grid-cols-1 overflow-y-auto lg:grid-cols-[minmax(0,1.05fr)_minmax(360px,0.95fr)] lg:overflow-hidden">
          <section
            aria-label="Thông tin và nội dung email"
            className="min-h-0 space-y-5 border-b p-5 sm:p-7 lg:overflow-y-auto lg:border-r lg:border-b-0"
          >
            <Label className="block space-y-2" htmlFor="template-name">
              <span className="block text-sm font-medium">Tên mẫu</span>
              <Input
                id="template-name"
                name="name"
                autoComplete="off"
                value={name}
                disabled={Boolean(template)}
                onChange={(event) => setName(event.target.value)}
              />
            </Label>

            <Label className="block space-y-2" htmlFor="template-subject">
              <span className="block text-sm font-medium">Tiêu đề email</span>
              <Input
                id="template-subject"
                name="subject"
                autoComplete="off"
                value={subject}
                onChange={(event) => setSubject(event.target.value)}
                placeholder="Ví dụ: Nhắc thanh toán hóa đơn {{invoiceNumber}}"
              />
            </Label>

            <div className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <Label htmlFor="template-body" className="text-sm font-medium">
                  Nội dung email
                </Label>
                <span className="rounded border bg-muted px-2 py-0.5 font-mono text-[11px] text-muted-foreground">
                  HTML
                </span>
              </div>
              <Textarea
                id="template-body"
                name="bodyHtml"
                rows={14}
                spellCheck={false}
                value={bodyHtml}
                onChange={(event) => setBodyHtml(event.target.value)}
                placeholder={
                  '<p>Chào {{customerName}},</p>\n<p>Hóa đơn {{invoiceNumber}} còn {{remainingAmount}} VND chưa thanh toán.</p>'
                }
                className="min-h-64 resize-y bg-muted/20 font-mono text-xs leading-6"
              />
              <p className="text-xs text-muted-foreground">
                Viết HTML trực tiếp. Thay đổi sẽ hiện ngay trong bản xem trước.
              </p>
            </div>

            <div className="space-y-3 rounded-lg border bg-muted/25 p-4">
              <div>
                <h3 className="text-sm font-medium">
                  Thông tin có thể tự điền
                </h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  Dùng đúng tên biến trong tiêu đề hoặc nội dung email.
                </p>
              </div>
              <ul className="flex flex-wrap gap-2">
                {TEMPLATE_VARIABLES.map((variable) => (
                  <li
                    key={variable.name}
                    className="inline-flex items-center gap-2 rounded-md border bg-background px-2.5 py-1.5 text-xs"
                    title={variable.label}
                  >
                    <code className="font-mono text-foreground">
                      {'{{'}
                      {variable.name}
                      {'}}'}
                    </code>
                    <span className="text-muted-foreground">
                      {variable.label}
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            <section className="space-y-3 rounded-lg border p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-sm font-medium">File gửi kèm</h3>
                  <p className="mt-1 text-xs text-muted-foreground">
                    PDF, PNG hoặc JPG · tối đa 10 MB mỗi file, tổng 25 MB.
                  </p>
                </div>
                {template && (
                  <span className="shrink-0 rounded-full bg-secondary px-2.5 py-1 text-xs text-secondary-foreground">
                    {template.attachments.length}/5
                  </span>
                )}
              </div>

              {template ? (
                <>
                  {template.attachments.length > 0 ? (
                    <ul className="divide-y rounded-md border">
                      {template.attachments.map((attachment) => (
                        <li
                          key={attachment.id}
                          className="flex min-w-0 items-start justify-between gap-3 p-3"
                        >
                          <div className="min-w-0 space-y-1">
                            <p className="break-all text-sm font-medium">
                              {attachment.filename}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {attachment.mimeType}
                            </p>
                            {attachment.mimeType.startsWith('image/') && (
                              <p className="break-all text-xs text-muted-foreground">
                                Chèn ảnh trong HTML:{' '}
                                <code className="font-mono text-foreground">
                                  {`<img src="cid:${attachment.filename}" alt="" />`}
                                </code>
                              </p>
                            )}
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            aria-label={`Xóa ${attachment.filename}`}
                            disabled={deleteAttachment.isPending}
                            onClick={() =>
                              deleteAttachment.mutate({
                                templateId: template.id,
                                attachmentId: attachment.id,
                              })
                            }
                          >
                            Xóa
                          </Button>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="rounded-md bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                      Chưa có file nào được đính kèm.
                    </p>
                  )}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="application/pdf,image/png,image/jpeg"
                    aria-label="Chọn file đính kèm"
                    disabled={
                      uploadAttachment.isPending ||
                      template.attachments.length >= 5
                    }
                    onChange={handleFileChange}
                    className="block w-full text-sm text-muted-foreground file:mr-3 file:rounded-md file:border-0 file:bg-secondary file:px-3 file:py-2 file:font-medium file:text-secondary-foreground pointer-hover:file:hover:bg-secondary/80"
                  />
                  {uploadAttachment.isPending && (
                    <p role="status" className="text-xs text-muted-foreground">
                      Đang tải file lên…
                    </p>
                  )}
                </>
              ) : (
                <p className="rounded-md bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                  Lưu mẫu trước, sau đó bạn có thể thêm file gửi kèm.
                </p>
              )}
            </section>
          </section>

          <section
            aria-label="Bản xem trước email"
            className="min-h-80 space-y-4 bg-muted/35 p-5 sm:p-7 lg:overflow-y-auto"
          >
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold">Bản xem trước</h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  Nội dung mẫu · cập nhật khi bạn nhập
                </p>
              </div>
            </div>

            <div className="overflow-hidden rounded-lg border bg-background shadow-sm">
              <div className="space-y-2 border-b px-4 py-3">
                <div className="flex gap-2 text-xs">
                  <span className="w-14 shrink-0 text-muted-foreground">
                    Đến
                  </span>
                  <span className="truncate">ketoan@abccompany.vn</span>
                </div>
                <div className="flex gap-2 text-xs">
                  <span className="w-14 shrink-0 text-muted-foreground">
                    Tiêu đề
                  </span>
                  <span className="min-w-0 break-words font-medium">
                    {previewSubject || 'Chưa có tiêu đề'}
                  </span>
                </div>
              </div>
              <iframe
                title="Bản xem trước nội dung email"
                className="h-[440px] w-full bg-white"
                sandbox=""
                srcDoc={createPreviewDocument(previewBody)}
              />
            </div>
            <p className="text-xs leading-relaxed text-muted-foreground">
              Bản xem trước dùng dữ liệu minh họa. Ảnh đã tải lên sẽ hiển thị
              trong email thật khi bạn chèn mã <code>cid:</code> tương ứng.
            </p>
          </section>
        </div>

        <DialogFooter className="shrink-0 border-t bg-background px-5 py-3 sm:px-7">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Hủy
          </Button>
          <Button
            type="button"
            disabled={pending || uploadAttachment.isPending}
            onClick={submit}
          >
            {pending ? 'Đang lưu…' : 'Lưu mẫu'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
