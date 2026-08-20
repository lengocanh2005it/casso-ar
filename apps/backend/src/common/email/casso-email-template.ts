import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { EmailAttachment } from './email-attachment';

const LOGO_CONTENT = readFileSync(
  join(__dirname, 'assets/casso-ledger-logo.png'),
).toString('base64');

const LOGO_ATTACHMENT: EmailAttachment = {
  filename: 'casso-ledger-logo.png',
  content: LOGO_CONTENT,
  contentId: 'casso-ledger-logo',
  contentType: 'image/png',
};

export interface CassoEmailAction {
  label: string;
  url: string;
}

export interface CassoEmailHighlight {
  label: string;
  value: string;
}

export interface CassoEmailInput {
  title: string;
  greeting: string;
  paragraphs: string[];
  highlight?: CassoEmailHighlight;
  action?: CassoEmailAction;
  closing?: string;
}

export interface CassoEmailContent {
  html: string;
  text: string;
  attachments: EmailAttachment[];
}

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
      })[character] ?? character,
  );
}

function renderClosing(closing: string): string {
  return escapeHtml(closing).replaceAll('\n', '<br />');
}

export function buildCassoEmail(input: CassoEmailInput): CassoEmailContent {
  const closing = input.closing ?? 'Trân trọng,\nĐội ngũ Casso Ledger';
  const title = escapeHtml(input.title);
  const greeting = escapeHtml(input.greeting);
  const paragraphs = input.paragraphs
    .map(
      (paragraph) => `<p style="margin:0 0 16px;">${escapeHtml(paragraph)}</p>`,
    )
    .join('');
  const highlightHtml = input.highlight
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;margin:0 0 24px;border:1px solid #b6e5cf;border-radius:10px;background:#ecfaf2;">
        <tr>
          <td align="center" style="padding:18px 16px;">
            <p style="margin:0 0 8px;color:#426154;font-size:14px;line-height:1.4;font-weight:700;">${escapeHtml(input.highlight.label)}</p>
            <p style="margin:0;color:#0f8b55;font-size:28px;line-height:1.2;font-weight:700;letter-spacing:4px;">${escapeHtml(input.highlight.value)}</p>
          </td>
        </tr>
      </table>`
    : '';
  const actionHtml = input.action
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0;">
        <tr>
          <td style="border-radius:8px;background:#16a668;">
            <a href="${escapeHtml(input.action.url)}" style="display:inline-block;padding:13px 22px;border-radius:8px;color:#ffffff;font-weight:700;text-decoration:none;">${escapeHtml(input.action.label)}</a>
          </td>
        </tr>
      </table>
      <p style="margin:0 0 16px;color:#5f6b66;font-size:13px;line-height:1.6;">Nếu nút phía trên không hoạt động, Quý khách có thể mở liên kết sau:<br /><a href="${escapeHtml(input.action.url)}" style="color:#168c5a;word-break:break-all;">${escapeHtml(input.action.url)}</a></p>`
    : '';
  const html = `<!doctype html>
<html lang="vi">
  <body style="margin:0;padding:0;background:#f3f6f4;color:#22312a;font-family:Arial,Helvetica,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;background:#f3f6f4;">
      <tr>
        <td align="center" style="padding:32px 16px;">
          <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background:#ffffff;border:1px solid #e1e9e4;border-radius:12px;overflow:hidden;">
            <tr>
              <td align="center" style="padding:24px 24px 18px;border-bottom:1px solid #e8efeb;">
                <img src="cid:casso-ledger-logo" alt="Casso Ledger" width="150" height="150" style="display:block;width:150px;height:150px;" />
              </td>
            </tr>
            <tr>
              <td style="padding:32px;">
                <h1 style="margin:0 0 24px;color:#18352a;font-size:24px;line-height:1.3;">${title}</h1>
                <p style="margin:0 0 16px;line-height:1.7;">${greeting}</p>
                ${highlightHtml}
                ${paragraphs}
                ${actionHtml}
                <p style="margin:24px 0 0;line-height:1.7;">${renderClosing(closing)}</p>
              </td>
            </tr>
            <tr>
              <td style="padding:18px 32px;background:#f8faf9;color:#718078;font-size:12px;line-height:1.6;text-align:center;">
                Email này được gửi tự động từ Casso Ledger. Vui lòng không trả lời trực tiếp email này.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
  const text = [
    input.title,
    input.greeting,
    ...(input.highlight
      ? [`${input.highlight.label}: ${input.highlight.value}`]
      : []),
    ...input.paragraphs,
    ...(input.action ? [`${input.action.label}: ${input.action.url}`] : []),
    closing,
    'Email này được gửi tự động từ Casso Ledger. Vui lòng không trả lời trực tiếp email này.',
  ].join('\n\n');

  return { html, text, attachments: [LOGO_ATTACHMENT] };
}
