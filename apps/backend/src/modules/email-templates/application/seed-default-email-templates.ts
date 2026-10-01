import { randomUUID } from 'node:crypto';
import { EmailTemplate } from '../domain/email-template';

interface DefaultTemplateDefinition {
  name: string;
  reminderStage: string;
  subject: string;
  bodyHtml: string;
}

// Gmail/Outlook strip <style> blocks and ignore most CSS, so the layout is
// table-based with inline styles only.
const ACCENT = '#0f7a4d';
const INK = '#0f172a';
const MUTED = '#64748b';
const BORDER = '#e2e8f0';
const SURFACE = '#f8fafc';

export function detailRow(
  label: string,
  value: string,
  emphasis = false,
): string {
  return (
    '<tr>' +
    `<td style="padding:11px 0;border-bottom:1px solid ${BORDER};color:${MUTED};font-size:14px;line-height:1.5;">${label}</td>` +
    `<td align="right" style="padding:11px 0;border-bottom:1px solid ${BORDER};color:${INK};font-size:${emphasis ? '17' : '14'}px;font-weight:${emphasis ? '700' : '600'};line-height:1.5;">${value}</td>` +
    '</tr>'
  );
}

export function detailCard(rows: string): string {
  return (
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" ' +
    `style="margin:0 0 26px;background:${SURFACE};border:1px solid ${BORDER};border-radius:10px;">` +
    '<tr><td style="padding:6px 22px;">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0">' +
    rows +
    '</table>' +
    '</td></tr>' +
    '</table>'
  );
}

export function paragraph(html: string): string {
  return `<p style="margin:0 0 18px;color:${INK};font-size:15px;line-height:1.7;">${html}</p>`;
}

export function emailShell(content: string): string {
  return (
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" ' +
    'style="background:#f1f5f9;padding:28px 14px;">' +
    '<tr><td align="center">' +
    '<table role="presentation" width="600" cellpadding="0" cellspacing="0" ' +
    'style="width:600px;max-width:100%;background:#ffffff;border-radius:14px;">' +
    '<tr><td style="padding:26px 32px 22px;border-bottom:1px solid ' +
    BORDER +
    ';">' +
    `<p style="margin:0 0 7px;color:${ACCENT};font-size:11px;font-weight:700;letter-spacing:1.6px;text-transform:uppercase;">Thông báo công nợ</p>` +
    `<h1 style="margin:0;color:${INK};font-size:21px;line-height:1.3;font-weight:700;">{{organizationName}}</h1>` +
    '</td></tr>' +
    `<tr><td style="padding:28px 32px;">${content}</td></tr>` +
    '<tr><td style="padding:20px 32px;background:' +
    SURFACE +
    `;border-top:1px solid ${BORDER};">` +
    `<p style="margin:0;color:${MUTED};font-size:12px;line-height:1.6;">Email được gửi tự động bởi hệ thống công nợ {{organizationName}}. Vui lòng không trả lời trực tiếp email này.</p>` +
    '</td></tr>' +
    '</table>' +
    '</td></tr>' +
    '</table>'
  );
}

export function greeting(): string {
  return paragraph('Kính gửi <strong>{{customerName}}</strong>,');
}

export function closing(): string {
  return paragraph('Trân trọng,<br/>{{organizationName}}');
}

const DEFAULT_TEMPLATE_DEFINITIONS: DefaultTemplateDefinition[] = [
  {
    name: 'Nhắc trước hạn 3 ngày',
    reminderStage: 'Nhắc trước hạn 3 ngày',
    subject: 'Nhắc thanh toán hóa đơn {{invoiceNumber}}',
    bodyHtml: emailShell(
      greeting() +
        paragraph(
          'Hóa đơn <strong>{{invoiceNumber}}</strong> của Quý khách sắp đến hạn thanh toán. ' +
            'Kính mong Quý khách sắp xếp thanh toán đúng hạn.',
        ) +
        detailCard(
          detailRow('Số hóa đơn', '{{invoiceNumber}}') +
            detailRow('Ngày đến hạn', '{{dueDate}}') +
            detailRow('Còn phải thu', '{{remainingAmount}}', true),
        ) +
        closing(),
    ),
  },
  {
    name: 'Nhắc quá hạn 1 ngày',
    reminderStage: 'Nhắc quá hạn 1 ngày',
    subject: 'Hóa đơn {{invoiceNumber}} đã quá hạn thanh toán',
    bodyHtml: emailShell(
      greeting() +
        paragraph(
          'Hóa đơn <strong>{{invoiceNumber}}</strong> đã quá hạn thanh toán. ' +
            'Kính mong Quý khách sắp xếp thanh toán sớm nhất có thể.',
        ) +
        detailCard(
          detailRow('Số hóa đơn', '{{invoiceNumber}}') +
            detailRow('Ngày đến hạn', '{{dueDate}}') +
            detailRow('Ngày quá hạn', '{{daysOverdue}} ngày') +
            detailRow('Còn phải thu', '{{remainingAmount}}', true),
        ) +
        closing(),
    ),
  },
  {
    name: 'Nhắc quá hạn 7 ngày',
    reminderStage: 'Nhắc quá hạn 7 ngày',
    subject:
      'Nhắc lần 2: Hóa đơn {{invoiceNumber}} đã quá hạn {{daysOverdue}} ngày',
    bodyHtml: emailShell(
      greeting() +
        paragraph(
          'Đây là lần nhắc thứ hai về hóa đơn <strong>{{invoiceNumber}}</strong>. ' +
            'Kính mong Quý khách hoàn tất thanh toán sớm.',
        ) +
        detailCard(
          detailRow('Số hóa đơn', '{{invoiceNumber}}') +
            detailRow('Ngày đến hạn', '{{dueDate}}') +
            detailRow('Ngày quá hạn', '{{daysOverdue}} ngày') +
            detailRow('Còn phải thu', '{{remainingAmount}}', true),
        ) +
        closing(),
    ),
  },
  {
    name: 'Nhắc quá hạn 30 ngày',
    reminderStage: 'Nhắc quá hạn 30 ngày',
    subject: 'Khẩn: Hóa đơn {{invoiceNumber}} đã quá hạn {{daysOverdue}} ngày',
    bodyHtml: emailShell(
      greeting() +
        paragraph(
          'Hóa đơn <strong>{{invoiceNumber}}</strong> đã quá hạn thanh toán lâu ngày. ' +
            'Kính mong Quý khách liên hệ bộ phận công nợ của {{organizationName}} ' +
            'sớm nhất có thể để được hỗ trợ xử lý.',
        ) +
        detailCard(
          detailRow('Số hóa đơn', '{{invoiceNumber}}') +
            detailRow('Ngày đến hạn', '{{dueDate}}') +
            detailRow('Ngày quá hạn', '{{daysOverdue}} ngày') +
            detailRow('Tổng còn phải thu', '{{remainingAmount}}', true),
        ) +
        closing(),
    ),
  },
];

export function buildDefaultEmailTemplates(
  organizationId: string,
  now: Date,
): EmailTemplate[] {
  return DEFAULT_TEMPLATE_DEFINITIONS.map(
    (definition) =>
      new EmailTemplate({
        id: randomUUID(),
        organizationId,
        name: definition.name,
        subject: definition.subject,
        bodyHtml: definition.bodyHtml,
        reminderStage: definition.reminderStage,
        isDefault: true,
        createdAt: now,
        updatedAt: now,
        version: 1,
      }),
  );
}
