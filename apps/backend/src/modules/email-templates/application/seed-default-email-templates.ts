import { randomUUID } from 'node:crypto';
import { EmailTemplate } from '../domain/email-template';

interface DefaultTemplateDefinition {
  name: string;
  reminderStage: string;
  subject: string;
  bodyHtml: string;
}

const DEFAULT_TEMPLATE_DEFINITIONS: DefaultTemplateDefinition[] = [
  {
    name: 'Nhắc trước hạn 3 ngày',
    reminderStage: 'Nhắc trước hạn 3 ngày',
    subject: 'Nhắc thanh toán hóa đơn {{invoiceNumber}}',
    bodyHtml:
      '<p>Kính gửi {{customerName}},</p>' +
      '<p>Hóa đơn {{invoiceNumber}} với số tiền còn lại {{remainingAmount}} sẽ đến hạn thanh toán vào {{dueDate}}. ' +
      'Quý khách vui lòng sắp xếp thanh toán đúng hạn.</p>' +
      '<p>Trân trọng,<br/>{{organizationName}}</p>',
  },
  {
    name: 'Nhắc quá hạn 1 ngày',
    reminderStage: 'Nhắc quá hạn 1 ngày',
    subject: 'Hóa đơn {{invoiceNumber}} đã quá hạn thanh toán',
    bodyHtml:
      '<p>Kính gửi {{customerName}},</p>' +
      '<p>Hóa đơn {{invoiceNumber}} đã quá hạn thanh toán {{daysOverdue}} ngày, với số tiền còn lại {{remainingAmount}}. ' +
      'Quý khách vui lòng thanh toán sớm nhất có thể.</p>' +
      '<p>Trân trọng,<br/>{{organizationName}}</p>',
  },
  {
    name: 'Nhắc quá hạn 7 ngày',
    reminderStage: 'Nhắc quá hạn 7 ngày',
    subject:
      'Nhắc lần 2: Hóa đơn {{invoiceNumber}} đã quá hạn {{daysOverdue}} ngày',
    bodyHtml:
      '<p>Kính gửi {{customerName}},</p>' +
      '<p>Hóa đơn {{invoiceNumber}} hiện đã quá hạn thanh toán {{daysOverdue}} ngày, với số tiền còn lại {{remainingAmount}}. ' +
      'Đây là lần nhắc thứ hai, kính mong quý khách hoàn tất thanh toán sớm.</p>' +
      '<p>Trân trọng,<br/>{{organizationName}}</p>',
  },
  {
    name: 'Nhắc quá hạn 30 ngày',
    reminderStage: 'Nhắc quá hạn 30 ngày',
    subject: 'Khẩn: Hóa đơn {{invoiceNumber}} đã quá hạn {{daysOverdue}} ngày',
    bodyHtml:
      '<p>Kính gửi {{customerName}},</p>' +
      '<p>Hóa đơn {{invoiceNumber}} đã quá hạn thanh toán {{daysOverdue}} ngày, với số tiền còn lại {{remainingAmount}}. ' +
      'Kính mong quý khách liên hệ bộ phận công nợ của {{organizationName}} sớm nhất có thể để xử lý.</p>' +
      '<p>Trân trọng,<br/>{{organizationName}}</p>',
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
      }),
  );
}
