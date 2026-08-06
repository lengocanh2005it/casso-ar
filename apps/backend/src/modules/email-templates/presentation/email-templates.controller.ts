import {
  Body,
  Controller,
  Get,
  Headers,
  Post,
  UseGuards,
} from '@nestjs/common';
import { IdempotencyService } from '../../../common/idempotency/idempotency.service';
import { Permission } from '../../../common/rbac/permission.enum';
import { PermissionGuard } from '../../../common/rbac/permission.guard';
import { RequirePermission } from '../../../common/rbac/require-permission.decorator';
import { CreateEmailTemplateUseCase } from '../application/create-email-template.usecase';
import { ListEmailTemplatesUseCase } from '../application/list-email-templates.usecase';
import { CreateEmailTemplateDto } from './dto/create-email-template.dto';

@Controller('email-templates')
@UseGuards(PermissionGuard)
export class EmailTemplatesController {
  constructor(
    private readonly createEmailTemplateUseCase: CreateEmailTemplateUseCase,
    private readonly listEmailTemplatesUseCase: ListEmailTemplatesUseCase,
    private readonly idempotency: IdempotencyService,
  ) {}

  @Get()
  async list() {
    return this.listEmailTemplatesUseCase.execute();
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
        return this.createEmailTemplateUseCase.execute({
          name: dto.name,
          subject: dto.subject,
          bodyHtml: dto.bodyHtml,
          reminderStage: dto.reminderStage ?? null,
        });
      },
    );
  }
}
