import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EmailDraftPreview } from './email-draft-preview';

const bodyHtml =
  '<p>Kính gửi ABC, còn lại 1.000.000 VND.</p><script>alert(1)</script>';

describe('EmailDraftPreview', () => {
  beforeEach(() => {
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
  });

  it('renders the subject and recipient', () => {
    render(
      <EmailDraftPreview
        subject="Nhắc thanh toán"
        recipientEmail="ap@abc.vn"
        bodyHtml={bodyHtml}
      />,
    );
    expect(screen.getByText('Nhắc thanh toán')).toBeInTheDocument();
    expect(screen.getByText('ap@abc.vn')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Xem trước' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Mã HTML' })).toBeInTheDocument();
  });

  it('renders the HTML body inside a sandboxed iframe by default', () => {
    render(
      <EmailDraftPreview
        subject="Nhắc thanh toán"
        recipientEmail="ap@abc.vn"
        bodyHtml={bodyHtml}
      />,
    );
    const iframe = screen.getByTitle('Xem trước email') as HTMLIFrameElement;
    expect(iframe).toBeInTheDocument();
    expect(iframe.getAttribute('sandbox')).toBe('');
    expect(iframe.srcdoc).toBe(bodyHtml);
  });

  it('switches to escaped HTML-code view and back', () => {
    render(
      <EmailDraftPreview
        subject="Nhắc thanh toán"
        recipientEmail="ap@abc.vn"
        bodyHtml={bodyHtml}
      />,
    );

    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Mã HTML' }));

    expect(screen.queryByTitle('Xem trước email')).not.toBeInTheDocument();
    expect(screen.getByText(bodyHtml)).toBeInTheDocument();

    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Xem trước' }));
    expect(screen.getByTitle('Xem trước email')).toBeInTheDocument();
  });

  it('copies the HTML source to the clipboard', () => {
    render(
      <EmailDraftPreview
        subject="Nhắc thanh toán"
        recipientEmail="ap@abc.vn"
        bodyHtml={bodyHtml}
      />,
    );

    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Mã HTML' }));
    fireEvent.click(screen.getByRole('button', { name: /sao chép/i }));

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(bodyHtml);
  });
});
