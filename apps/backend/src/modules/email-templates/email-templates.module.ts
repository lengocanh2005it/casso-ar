import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { IdempotencyModule } from '../../common/idempotency/idempotency.module';
import { ATTACHMENT_STORAGE } from './application/attachment-storage.port';
import { CreateEmailTemplateUseCase } from './application/create-email-template.usecase';
import { DeleteEmailTemplateUseCase } from './application/delete-email-template.usecase';
import { DeleteEmailTemplateAttachmentUseCase } from './application/delete-email-template-attachment.usecase';
import { EMAIL_TEMPLATE_ATTACHMENT_REPOSITORY } from './application/email-template-attachment-repository.port';
import { EMAIL_TEMPLATE_REPOSITORY } from './application/email-template-repository.port';
import { ListEmailTemplatesUseCase } from './application/list-email-templates.usecase';
import { PreviewEmailTemplateUseCase } from './application/preview-email-template.usecase';
import { RenderEmailTemplateUseCase } from './application/render-email-template.usecase';
import { TEMPLATE_COMPILER } from './application/template-compiler.port';
import { UpdateEmailTemplateUseCase } from './application/update-email-template.usecase';
import { UploadEmailTemplateAttachmentUseCase } from './application/upload-email-template-attachment.usecase';
import { EmailTemplateOrmEntity } from './infrastructure/email-template.orm-entity';
import { EmailTemplateAttachmentOrmEntity } from './infrastructure/email-template-attachment.orm-entity';
import { HandlebarsTemplateCompiler } from './infrastructure/handlebars-template-compiler.adapter';
import { LocalDiskAttachmentStorage } from './infrastructure/local-disk-attachment-storage.adapter';
import { TypeOrmEmailTemplateRepository } from './infrastructure/typeorm-email-template.repository';
import { TypeOrmEmailTemplateAttachmentRepository } from './infrastructure/typeorm-email-template-attachment.repository';
import { EmailTemplatesController } from './presentation/email-templates.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      EmailTemplateOrmEntity,
      EmailTemplateAttachmentOrmEntity,
    ]),
    IdempotencyModule,
  ],
  providers: [
    {
      provide: EMAIL_TEMPLATE_REPOSITORY,
      useClass: TypeOrmEmailTemplateRepository,
    },
    {
      provide: EMAIL_TEMPLATE_ATTACHMENT_REPOSITORY,
      useClass: TypeOrmEmailTemplateAttachmentRepository,
    },
    {
      provide: ATTACHMENT_STORAGE,
      useFactory: () => new LocalDiskAttachmentStorage(),
    },
    {
      provide: TEMPLATE_COMPILER,
      useClass: HandlebarsTemplateCompiler,
    },
    CreateEmailTemplateUseCase,
    ListEmailTemplatesUseCase,
    UpdateEmailTemplateUseCase,
    DeleteEmailTemplateUseCase,
    RenderEmailTemplateUseCase,
    PreviewEmailTemplateUseCase,
    UploadEmailTemplateAttachmentUseCase,
    DeleteEmailTemplateAttachmentUseCase,
  ],
  controllers: [EmailTemplatesController],
  exports: [
    EMAIL_TEMPLATE_REPOSITORY,
    EMAIL_TEMPLATE_ATTACHMENT_REPOSITORY,
    ATTACHMENT_STORAGE,
    RenderEmailTemplateUseCase,
  ],
})
export class EmailTemplatesModule {}
