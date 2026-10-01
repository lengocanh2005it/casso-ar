import type { MigrationInterface, QueryRunner } from 'typeorm';
import { buildDefaultEmailTemplates } from '../../modules/email-templates/application/seed-default-email-templates';
import { buildSeedEmailTemplatePlans } from '../seed/seed-dataset';

const GREETING = '<p>Kính gửi {{customerName}},</p>';
const CLOSING = '<p>Trân trọng,<br/>{{organizationName}}</p>';

const LEGACY_DEFAULT_BODIES = [
  GREETING +
    '<p>Hóa đơn {{invoiceNumber}} với số tiền còn lại {{remainingAmount}} sẽ đến hạn thanh toán vào {{dueDate}}. Quý khách vui lòng sắp xếp thanh toán đúng hạn.</p>' +
    CLOSING,
  GREETING +
    '<p>Hóa đơn {{invoiceNumber}} đã quá hạn thanh toán {{daysOverdue}} ngày, với số tiền còn lại {{remainingAmount}}. Quý khách vui lòng thanh toán sớm nhất có thể.</p>' +
    CLOSING,
  GREETING +
    '<p>Hóa đơn {{invoiceNumber}} hiện đã quá hạn thanh toán {{daysOverdue}} ngày, với số tiền còn lại {{remainingAmount}}. Đây là lần nhắc thứ hai, kính mong quý khách hoàn tất thanh toán sớm.</p>' +
    CLOSING,
  GREETING +
    '<p>Hóa đơn {{invoiceNumber}} đã quá hạn thanh toán {{daysOverdue}} ngày, với số tiền còn lại {{remainingAmount}}. Kính mong quý khách liên hệ bộ phận công nợ của {{organizationName}} sớm nhất có thể để xử lý.</p>' +
    CLOSING,
];

const LEGACY_DEMO = [
  {
    name: 'Invoice Reminder',
    subject: 'Nhắc thanh toán hóa đơn {{invoiceNumber}}',
    reminderStage: 'pre-due',
    bodyHtml:
      GREETING +
      '<p>Hóa đơn {{invoiceNumber}} với số tiền {{remainingAmount}} sẽ đến hạn vào {{dueDate}}. Vui lòng thanh toán đúng hạn.</p>' +
      CLOSING,
  },
  {
    name: 'Payment Confirmation',
    subject: 'Xác nhận thanh toán {{invoiceNumber}}',
    reminderStage: null,
    bodyHtml:
      GREETING +
      '<p>Chúng tôi đã nhận được thanh toán {{paidAmount}} cho hóa đơn {{invoiceNumber}}. Số tiền còn lại là {{remainingAmount}}.</p>' +
      CLOSING,
  },
  {
    name: 'Overdue Notice',
    subject: 'Thông báo quá hạn: Hóa đơn {{invoiceNumber}}',
    reminderStage: 'overdue-1',
    bodyHtml:
      GREETING +
      '<p>Hóa đơn {{invoiceNumber}} đã quá hạn {{daysOverdue}} ngày với số tiền {{remainingAmount}}. Vui lòng thanh toán ngay.</p>' +
      CLOSING,
  },
  {
    name: 'Welcome',
    subject: 'Chào mừng {{customerName}} đến với {{organizationName}}',
    reminderStage: null,
    bodyHtml:
      GREETING +
      '<p>Cảm ơn bạn đã sử dụng dịch vụ của {{organizationName}}. Nếu có thắc mắc, vui lòng liên hệ chúng tôi.</p>' +
      CLOSING,
  },
  {
    name: 'Monthly Statement',
    subject: 'Bảng kê tháng {{month}} - {{customerName}}',
    reminderStage: null,
    bodyHtml:
      GREETING +
      '<p>Đây là bảng kê giao dịch tháng {{month}}. Tổng số phát sinh: {{totalAmount}}. Số tiền đã thanh toán: {{paidAmount}}. Số tiền còn nợ: {{remainingAmount}}.</p>' +
      CLOSING,
  },
  {
    name: 'Payment Receipt',
    subject: 'Biên lai thanh toán #{{receiptNumber}}',
    reminderStage: null,
    bodyHtml:
      GREETING +
      '<p>Biên lai thanh toán số {{receiptNumber}} ngày {{paymentDate}} với số tiền {{paidAmount}} đã được xác nhận.</p>' +
      CLOSING,
  },
];

export class RefreshLegacyEmailTemplates20261001000000
  implements MigrationInterface
{
  name = 'RefreshLegacyEmailTemplates20261001000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    const defaults = buildDefaultEmailTemplates('migration', new Date(0));
    const demo = buildSeedEmailTemplatePlans();
    const replacements = [
      ...defaults.map((after, index) => ({
        before: {
          name: after.name,
          subject: after.subject,
          bodyHtml: LEGACY_DEFAULT_BODIES[index],
          reminderStage: after.reminderStage,
          isDefault: true,
        },
        after,
      })),
      ...LEGACY_DEMO.map((before, index) => ({
        before: { ...before, isDefault: false },
        after: demo[index],
      })),
    ];

    for (const { before, after } of replacements) {
      await queryRunner.query(
        `WITH original AS (
          SELECT "id", "organizationId", "bodyHtml"
          FROM "email_templates"
          WHERE "name" = $4 AND "subject" = $5 AND "bodyHtml" = $6
            AND "reminderStage" IS NOT DISTINCT FROM $7 AND "isDefault" = $8
        )
        UPDATE "email_templates" AS t
        SET "name" = $1, "subject" = $2, "bodyHtml" = $3,
            "updatedAt" = CURRENT_TIMESTAMP, "version" = t."version" + 1
        FROM original
        WHERE t."id" = original."id"
          AND t."organizationId" = original."organizationId"
          AND t."bodyHtml" = original."bodyHtml"`,
        [
          after.name,
          after.subject,
          after.bodyHtml,
          before.name,
          before.subject,
          before.bodyHtml,
          before.reminderStage,
          before.isDefault,
        ],
      );
    }
  }

  // A rollback cannot distinguish migrated templates from later user edits.
  async down(): Promise<void> {}
}
