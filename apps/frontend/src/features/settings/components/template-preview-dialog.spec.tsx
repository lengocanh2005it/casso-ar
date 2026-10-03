import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TemplatePreviewDialog } from './template-preview-dialog';

const { mutate } = vi.hoisted(() => ({ mutate: vi.fn() }));

vi.mock('../api/use-settings', () => ({
  usePreviewTemplate: () => ({
    mutate,
    isPending: false,
    isError: false,
    data: {
      subject: `Subject-${'s'.repeat(80)}`,
      bodyHtml: '<p>Preview</p>',
    },
  }),
}));

describe('TemplatePreviewDialog', () => {
  it('wraps long template names and subjects instead of clipping them', () => {
    const name = `Template-${'n'.repeat(80)}`;
    const subject = `Subject-${'s'.repeat(80)}`;

    render(
      <TemplatePreviewDialog
        template={{
          id: 'template-1',
          name,
          subject,
          bodyHtml: '<p>Body</p>',
          reminderStage: null,
          isDefault: false,
          createdAt: '2026-08-01',
          updatedAt: '2026-08-01',
          attachments: [],
        }}
        open
        onOpenChange={vi.fn()}
      />,
    );

    expect(screen.getByText(name)).toHaveClass(
      'whitespace-normal',
      'break-words',
    );
    expect(screen.getByText(name)).toHaveAttribute('title', name);
    expect(screen.getByText(subject)).toHaveClass(
      'whitespace-normal',
      'break-words',
    );
    expect(screen.getByText(subject)).toHaveAttribute('title', subject);
  });

  it('gives the email its own readable viewport', () => {
    render(
      <TemplatePreviewDialog template={null} open onOpenChange={vi.fn()} />,
    );

    const dialog = screen.getByRole('dialog');
    expect(dialog.className).toContain('sm:max-w-3xl');
    expect(
      screen.getByTitle('Bản xem trước nội dung email').className,
    ).toContain('h-[min(60vh,560px)]');
  });
});
