import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { EmailTemplate } from '@/lib/use-email-templates';
import { TemplateDialog } from './template-dialog';

vi.mock('../api/use-settings', () => ({
  useCreateTemplate: () => ({ mutate: vi.fn(), isPending: false }),
  useDeleteTemplateAttachment: () => ({ mutate: vi.fn(), isPending: false }),
  useUpdateTemplate: () => ({ mutate: vi.fn(), isPending: false }),
  useUploadTemplateAttachment: () => ({ mutate: vi.fn(), isPending: false }),
}));

const template: EmailTemplate = {
  id: 'template-1',
  name: 'Nhắc thanh toán',
  subject: 'Nhắc hóa đơn {{invoiceNumber}}',
  bodyHtml: '<p>Chào {{customerName}}</p>',
  reminderStage: null,
  isDefault: false,
  createdAt: '2026-08-01',
  updatedAt: '2026-08-01',
  attachments: [],
};

describe('TemplateDialog', () => {
  it('previews unsaved HTML and sample variables while editing', () => {
    render(<TemplateDialog template={null} open onOpenChange={vi.fn()} />);

    fireEvent.change(screen.getByRole('textbox', { name: /tiêu đề/i }), {
      target: { value: 'Nhắc hóa đơn {{invoiceNumber}}' },
    });
    fireEvent.change(screen.getByRole('textbox', { name: /nội dung/i }), {
      target: { value: '<p>Chào {{customerName}}</p>' },
    });

    const preview = screen.getByTitle(
      'Bản xem trước nội dung email',
    ) as HTMLIFrameElement;
    expect(preview.getAttribute('srcdoc')).toContain(
      '<p>Chào ABC Company Ltd.</p>',
    );
    expect(screen.getByText('Nhắc hóa đơn INV-2026-0088')).toBeTruthy();
  });

  it('leaves unsupported variable names intact in the preview', () => {
    render(<TemplateDialog template={null} open onOpenChange={vi.fn()} />);

    fireEvent.change(screen.getByRole('textbox', { name: /nội dung/i }), {
      target: { value: '<p>{{constructor}}</p>' },
    });

    const preview = screen.getByTitle(
      'Bản xem trước nội dung email',
    ) as HTMLIFrameElement;
    expect(preview.getAttribute('srcdoc')).toContain('<p>{{constructor}}</p>');
  });

  it('blocks network requests from the HTML preview', () => {
    render(<TemplateDialog template={null} open onOpenChange={vi.fn()} />);

    const preview = screen.getByTitle(
      'Bản xem trước nội dung email',
    ) as HTMLIFrameElement;
    expect(preview.getAttribute('srcdoc')).toContain(
      "default-src 'none'; img-src data:",
    );
  });

  it('keeps the draft when an attachment refetches the template', () => {
    const { rerender } = render(
      <TemplateDialog template={template} open onOpenChange={vi.fn()} />,
    );
    const body = screen.getByRole('textbox', { name: /nội dung/i });
    fireEvent.change(body, { target: { value: '<p>Bản nháp đang sửa</p>' } });

    rerender(
      <TemplateDialog
        template={{
          ...template,
          attachments: [
            {
              id: 'attachment-1',
              filename: 'brand.png',
              mimeType: 'image/png',
              sizeBytes: 1024,
              createdAt: '2026-08-01',
            },
          ],
        }}
        open
        onOpenChange={vi.fn()}
      />,
    );

    expect(
      (
        screen.getByRole('textbox', {
          name: /nội dung/i,
        }) as HTMLTextAreaElement
      ).value,
    ).toBe('<p>Bản nháp đang sửa</p>');
  });

  it('shows the CID markup for an uploaded image', () => {
    render(
      <TemplateDialog
        template={{
          ...template,
          attachments: [
            {
              id: 'attachment-1',
              filename: 'brand.png',
              mimeType: 'image/png',
              sizeBytes: 1024,
              createdAt: '2026-08-01',
            },
          ],
        }}
        open
        onOpenChange={vi.fn()}
      />,
    );

    expect(screen.getByText('<img src="cid:brand.png" alt="" />')).toBeTruthy();
  });
});
