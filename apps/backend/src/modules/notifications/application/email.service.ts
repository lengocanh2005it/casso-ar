import { Inject, Injectable, Logger } from '@nestjs/common';
import { AppError } from '../../../common/errors/app-error';
import { ErrorCode } from '../../../common/errors/error-code';
import { TenantContextService } from '../../../common/tenancy/tenant-context';
import {
  CUSTOMER_REPOSITORY,
  type ICustomerRepository,
} from '../../customers/application/customer-repository.port';
import {
  EMAIL_TEMPLATE_REPOSITORY,
  type IEmailTemplateRepository,
} from '../../email-templates/application/email-template-repository.port';
import { RenderEmailTemplateUseCase } from '../../email-templates/application/render-email-template.usecase';
import {
  type IInvoiceRepository,
  INVOICE_REPOSITORY,
} from '../../invoices/application/invoice-repository.port';
import {
  type IMembershipRepository,
  MEMBERSHIP_REPOSITORY,
} from '../../organizations/application/membership-repository.port';
import {
  type IOrganizationRepository,
  ORGANIZATION_REPOSITORY,
} from '../../organizations/application/organization-repository.port';
import {
  type IReceivableRepository,
  RECEIVABLE_REPOSITORY,
} from '../../receivables/application/receivable-repository.port';
import {
  type IUserRepository,
  USER_REPOSITORY,
} from '../../users/application/user-repository.port';
import { EMAIL_QUEUE_PORT, type IEmailQueue } from './email-queue.port';

export interface SendReminderEmailInput {
  receivableId: string;
  templateId: string;
  reminderExecutionId: string;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  constructor(
    @Inject(EMAIL_TEMPLATE_REPOSITORY)
    private readonly templateRepo: IEmailTemplateRepository,
    @Inject(RECEIVABLE_REPOSITORY)
    private readonly receivableRepo: IReceivableRepository,
    @Inject(CUSTOMER_REPOSITORY)
    private readonly customerRepo: ICustomerRepository,
    @Inject(ORGANIZATION_REPOSITORY)
    private readonly organizationRepo: IOrganizationRepository,
    @Inject(INVOICE_REPOSITORY)
    private readonly invoiceRepo: IInvoiceRepository,
    @Inject(MEMBERSHIP_REPOSITORY)
    private readonly membershipRepo: IMembershipRepository,
    @Inject(USER_REPOSITORY) private readonly userRepo: IUserRepository,
    @Inject(EMAIL_QUEUE_PORT) private readonly emailQueue: IEmailQueue,
    private readonly tenantContext: TenantContextService,
    private readonly renderUseCase: RenderEmailTemplateUseCase,
  ) {}

  async sendReminderEmail(input: SendReminderEmailInput): Promise<void> {
    const organizationId = this.tenantContext.getOrganizationId();
    const template = await this.templateRepo.findById(input.templateId);
    if (!template) {
      throw new AppError(
        ErrorCode.NOT_FOUND,
        `Email template ${input.templateId} không tồn tại.`,
      );
    }

    const receivable = await this.receivableRepo.findById(input.receivableId);
    if (!receivable) {
      throw new AppError(
        ErrorCode.RECEIVABLE_NOT_FOUND,
        'Khoản phải thu không tồn tại.',
      );
    }

    const customer = await this.customerRepo.findById(receivable.customerId);
    if (!customer) {
      throw new AppError(ErrorCode.NOT_FOUND, 'Khách hàng không tồn tại.');
    }

    const [organization, invoice, ownerMembership] = await Promise.all([
      this.organizationRepo.findById(organizationId),
      receivable.invoiceId
        ? this.invoiceRepo.findById(receivable.invoiceId)
        : Promise.resolve(null),
      this.membershipRepo.findOwnerByOrganization(organizationId),
    ]);
    const owner = ownerMembership
      ? await this.userRepo.findById(ownerMembership.userId)
      : null;
    const rendered = this.renderUseCase.render(template, {
      customerName: customer.name,
      invoiceNumber: invoice?.invoiceNumber ?? '',
      originalAmount: receivable.originalAmount,
      remainingAmount: receivable.remainingAmount,
      dueDate: receivable.dueDate.toISOString().slice(0, 10),
      daysOverdue: Math.max(
        0,
        Math.floor((Date.now() - receivable.dueDate.getTime()) / MS_PER_DAY),
      ),
      organizationName: organization?.name ?? '',
    });

    try {
      await this.emailQueue.add(
        'send-reminder-email',
        {
          reminderExecutionId: input.reminderExecutionId,
          receivableId: input.receivableId,
          organizationId,
          to: customer.email,
          ...(owner?.email ? { replyTo: owner.email } : {}),
          subject: rendered.subject,
          html: rendered.bodyHtml,
          // Display-name-only sender customization (issue #96): the actual
          // domain stays Casso's, the org's name is the From display identity.
          fromName: organization?.name
            ? `${organization.name} (qua Casso)`
            : undefined,
        },
        {
          jobId: input.reminderExecutionId,
          attempts: 3,
          backoff: { type: 'exponential', delay: 5000 },
        },
      );
    } catch (error) {
      this.logger.error('Failed to enqueue reminder email', {
        receivableId: input.receivableId,
        organizationId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw AppError.withCause(
        error,
        ErrorCode.EMAIL_SEND_FAILED,
        'Không thể gửi email nhắc nhở. Vui lòng thử lại sau.',
      );
    }
  }
}
