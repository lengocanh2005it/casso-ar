import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { IdempotencyService } from '../../../common/idempotency/idempotency.service';
import { Permission } from '../../../common/rbac/permission.enum';
import { PermissionGuard } from '../../../common/rbac/permission.guard';
import { RequirePermission } from '../../../common/rbac/require-permission.decorator';
import { CreateEmailTemplateUseCase } from '../application/create-email-template.usecase';
import { DeleteEmailTemplateUseCase } from '../application/delete-email-template.usecase';
import { ListEmailTemplatesUseCase } from '../application/list-email-templates.usecase';
import { PreviewEmailTemplateUseCase } from '../application/preview-email-template.usecase';
import { UpdateEmailTemplateUseCase } from '../application/update-email-template.usecase';
import { CreateEmailTemplateDto } from './dto/create-email-template.dto';
import { toEmailTemplateResponse } from './dto/email-template-response.dto';
import { UpdateEmailTemplateDto } from './dto/update-email-template.dto';

@Controller('email-templates')
@UseGuards(PermissionGuard)
export class EmailTemplatesController {
  constructor(
    private readonly createEmailTemplateUseCase: CreateEmailTemplateUseCase,
    private readonly listEmailTemplatesUseCase: ListEmailTemplatesUseCase,
    private readonly updateEmailTemplateUseCase: UpdateEmailTemplateUseCase,
    private readonly deleteEmailTemplateUseCase: DeleteEmailTemplateUseCase,
    private readonly previewEmailTemplateUseCase: PreviewEmailTemplateUseCase,
    private readonly idempotency: IdempotencyService,
  ) {}

  @Get()
  @RequirePermission(Permission.EMAIL_TEMPLATE_READ)
  async list(@Query('page') page?: string, @Query('limit') limit?: string) {
    const templates = await this.listEmailTemplatesUseCase.execute({
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
    return templates.map(toEmailTemplateResponse);
  }

  @Post()
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
  @RequirePermission(Permission.EMAIL_TEMPLATE_READ)
  async preview(@Param('id') id: string) {
    return this.previewEmailTemplateUseCase.execute(id);
  }
}
