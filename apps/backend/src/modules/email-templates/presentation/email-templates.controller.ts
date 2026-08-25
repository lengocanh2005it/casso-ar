import { Permission } from '@casso-ar/shared-types';
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBody,
  ApiConsumes,
  ApiCreatedResponse,
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { memoryStorage } from 'multer';
import {
  AuditActionType,
  AuditEntityType,
} from '../../../common/audit/audit.enums';
import { Audited } from '../../../common/audit/audited.decorator';
import { ErrorCode } from '../../../common/errors/error-code';
import { IdempotencyService } from '../../../common/idempotency/idempotency.service';
import { PermissionGuard } from '../../../common/rbac/permission.guard';
import { RequirePermission } from '../../../common/rbac/require-permission.decorator';
import { ApiErrorResponse } from '../../../common/swagger/api-error-response.decorator';
import { successResponseSchema } from '../../../common/swagger/success-response-schema';
import { MAX_ATTACHMENT_SIZE_BYTES } from '../application/attachment-limits';
import { CreateEmailTemplateUseCase } from '../application/create-email-template.usecase';
import { DeleteEmailTemplateUseCase } from '../application/delete-email-template.usecase';
import { DeleteEmailTemplateAttachmentUseCase } from '../application/delete-email-template-attachment.usecase';
import { ListEmailTemplatesUseCase } from '../application/list-email-templates.usecase';
import { PreviewEmailTemplateUseCase } from '../application/preview-email-template.usecase';
import { UpdateEmailTemplateUseCase } from '../application/update-email-template.usecase';
import { UploadEmailTemplateAttachmentUseCase } from '../application/upload-email-template-attachment.usecase';
import { CreateEmailTemplateDto } from './dto/create-email-template.dto';
import {
  EmailTemplateAttachmentResponseDto,
  toEmailTemplateAttachmentResponse,
} from './dto/email-template-attachment-response.dto';
import {
  EmailTemplateResponseDto,
  toEmailTemplateResponse,
} from './dto/email-template-response.dto';
import { UpdateEmailTemplateDto } from './dto/update-email-template.dto';

@ApiTags('email-templates')
@Controller('email-templates')
@UseGuards(PermissionGuard)
export class EmailTemplatesController {
  constructor(
    private readonly createEmailTemplateUseCase: CreateEmailTemplateUseCase,
    private readonly listEmailTemplatesUseCase: ListEmailTemplatesUseCase,
    private readonly updateEmailTemplateUseCase: UpdateEmailTemplateUseCase,
    private readonly deleteEmailTemplateUseCase: DeleteEmailTemplateUseCase,
    private readonly previewEmailTemplateUseCase: PreviewEmailTemplateUseCase,
    private readonly uploadAttachmentUseCase: UploadEmailTemplateAttachmentUseCase,
    private readonly deleteAttachmentUseCase: DeleteEmailTemplateAttachmentUseCase,
    private readonly idempotency: IdempotencyService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List email templates' })
  @ApiOkResponse({ type: [EmailTemplateResponseDto] })
  @RequirePermission(Permission.EMAIL_TEMPLATE_READ)
  async list(@Query('page') page?: string, @Query('limit') limit?: string) {
    const results = await this.listEmailTemplatesUseCase.execute({
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
    return results.map((result) =>
      toEmailTemplateResponse(result.template, result.attachments),
    );
  }

  @Post()
  @ApiOperation({ summary: 'Create an email template' })
  @ApiHeader({ name: 'idempotency-key', required: false })
  @ApiCreatedResponse({ type: EmailTemplateResponseDto })
  @ApiErrorResponse(
    ErrorCode.VALIDATION_ERROR,
    ErrorCode.IDEMPOTENCY_KEY_REUSED,
  )
  @Audited(
    AuditActionType.EMAIL_TEMPLATE_CREATE,
    AuditEntityType.EMAIL_TEMPLATE,
  )
  @RequirePermission(Permission.REMINDER_POLICY_WRITE)
  async create(
    @Headers('idempotency-key') key: string | undefined,
    @Body() dto: CreateEmailTemplateDto,
  ) {
    return this.idempotency.execute(
      'POST /email-templates',
      key,
      dto,
      async () => {
        const template = await this.createEmailTemplateUseCase.execute({
          name: dto.name,
          subject: dto.subject,
          bodyHtml: dto.bodyHtml,
          reminderStage: dto.reminderStage ?? null,
        });
        return toEmailTemplateResponse(template);
      },
    );
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update an email template' })
  @ApiHeader({ name: 'idempotency-key', required: false })
  @ApiOkResponse({ type: EmailTemplateResponseDto })
  @ApiErrorResponse(
    ErrorCode.VALIDATION_ERROR,
    ErrorCode.NOT_FOUND,
    ErrorCode.IDEMPOTENCY_KEY_REUSED,
  )
  @Audited(
    AuditActionType.EMAIL_TEMPLATE_UPDATE,
    AuditEntityType.EMAIL_TEMPLATE,
  )
  @RequirePermission(Permission.REMINDER_POLICY_WRITE)
  async update(
    @Param('id') id: string,
    @Headers('idempotency-key') key: string | undefined,
    @Body() dto: UpdateEmailTemplateDto,
  ) {
    return this.idempotency.execute(
      `PATCH /email-templates/${id}`,
      key,
      dto,
      async () => {
        const template = await this.updateEmailTemplateUseCase.execute({
          id,
          subject: dto.subject,
          bodyHtml: dto.bodyHtml,
        });
        return toEmailTemplateResponse(template);
      },
    );
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete an email template' })
  @ApiHeader({ name: 'idempotency-key', required: false })
  @ApiOkResponse({
    description: 'Template deleted',
    schema: successResponseSchema(),
  })
  @ApiErrorResponse(
    ErrorCode.VALIDATION_ERROR,
    ErrorCode.NOT_FOUND,
    ErrorCode.CONFLICT,
    ErrorCode.TEMPLATE_IN_USE,
    ErrorCode.IDEMPOTENCY_KEY_REUSED,
  )
  @Audited(
    AuditActionType.EMAIL_TEMPLATE_DELETE,
    AuditEntityType.EMAIL_TEMPLATE,
  )
  @RequirePermission(Permission.REMINDER_POLICY_WRITE)
  async remove(
    @Param('id') id: string,
    @Headers('idempotency-key') key: string | undefined,
  ) {
    return this.idempotency.execute(
      `DELETE /email-templates/${id}`,
      key,
      { id },
      async () => {
        await this.deleteEmailTemplateUseCase.execute(id);
        return { success: true };
      },
    );
  }

  @Post(':id/preview')
  @ApiOperation({ summary: 'Render an email template preview' })
  @ApiCreatedResponse({
    description: 'Rendered subject and body',
    schema: {
      type: 'object',
      required: ['subject', 'bodyHtml'],
      properties: {
        subject: { type: 'string' },
        bodyHtml: { type: 'string' },
      },
    },
  })
  @ApiErrorResponse(ErrorCode.NOT_FOUND)
  @RequirePermission(Permission.EMAIL_TEMPLATE_READ)
  async preview(@Param('id') id: string) {
    return this.previewEmailTemplateUseCase.execute(id);
  }

  @Post(':id/attachments')
  @ApiOperation({ summary: 'Upload an attachment for an email template' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    description: 'File (multipart field "file", max 10 MB, PDF/PNG/JPEG only)',
    schema: {
      type: 'object',
      required: ['file'],
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @ApiHeader({ name: 'idempotency-key', required: false })
  @ApiCreatedResponse({ type: EmailTemplateAttachmentResponseDto })
  @ApiErrorResponse(
    ErrorCode.VALIDATION_ERROR,
    ErrorCode.NOT_FOUND,
    ErrorCode.FILE_TOO_LARGE,
    ErrorCode.IDEMPOTENCY_KEY_REUSED,
  )
  @Audited(
    AuditActionType.EMAIL_TEMPLATE_ATTACHMENT_CREATE,
    AuditEntityType.EMAIL_TEMPLATE,
  )
  @RequirePermission(Permission.REMINDER_POLICY_WRITE)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: MAX_ATTACHMENT_SIZE_BYTES },
    }),
  )
  async uploadAttachment(
    @Param('id') id: string,
    @Headers('idempotency-key') key: string | undefined,
    @UploadedFile() file: Express.Multer.File | undefined,
  ) {
    if (!file) throw new BadRequestException('File là bắt buộc.');
    return this.idempotency.execute(
      `POST /email-templates/${id}/attachments`,
      key,
      { filename: file.originalname, size: file.size },
      async () => {
        const attachment = await this.uploadAttachmentUseCase.execute({
          emailTemplateId: id,
          originalFilename: file.originalname,
          mimeType: file.mimetype,
          sizeBytes: file.size,
          buffer: file.buffer,
        });
        return toEmailTemplateAttachmentResponse(attachment);
      },
    );
  }

  @Delete(':id/attachments/:attachmentId')
  @ApiOperation({ summary: 'Delete an email template attachment' })
  @ApiHeader({ name: 'idempotency-key', required: false })
  @ApiOkResponse({
    description: 'Attachment deleted',
    schema: successResponseSchema(),
  })
  @ApiErrorResponse(
    ErrorCode.ATTACHMENT_NOT_FOUND,
    ErrorCode.IDEMPOTENCY_KEY_REUSED,
  )
  @Audited(
    AuditActionType.EMAIL_TEMPLATE_ATTACHMENT_DELETE,
    AuditEntityType.EMAIL_TEMPLATE,
  )
  @RequirePermission(Permission.REMINDER_POLICY_WRITE)
  async removeAttachment(
    @Param('id') id: string,
    @Param('attachmentId') attachmentId: string,
    @Headers('idempotency-key') key: string | undefined,
  ) {
    return this.idempotency.execute(
      `DELETE /email-templates/${id}/attachments/${attachmentId}`,
      key,
      { id, attachmentId },
      async () => {
        await this.deleteAttachmentUseCase.execute(id, attachmentId);
        return { success: true };
      },
    );
  }
}
