import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { IdempotencyModule } from '../../common/idempotency/idempotency.module';
import { CreateEmailTemplateUseCase } from './application/create-email-template.usecase';
import { DeleteEmailTemplateUseCase } from './application/delete-email-template.usecase';
import { EMAIL_TEMPLATE_REPOSITORY } from './application/email-template-repository.port';
import { ListEmailTemplatesUseCase } from './application/list-email-templates.usecase';
import { PreviewEmailTemplateUseCase } from './application/preview-email-template.usecase';
import { RenderEmailTemplateUseCase } from './application/render-email-template.usecase';
import { TEMPLATE_COMPILER } from './application/template-compiler.port';
import { UpdateEmailTemplateUseCase } from './application/update-email-template.usecase';
import { EmailTemplateOrmEntity } from './infrastructure/email-template.orm-entity';
import { HandlebarsTemplateCompiler } from './infrastructure/handlebars-template-compiler.adapter';
import { TypeOrmEmailTemplateRepository } from './infrastructure/typeorm-email-template.repository';
import { EmailTemplatesController } from './presentation/email-templates.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([EmailTemplateOrmEntity]),
    IdempotencyModule,
  ],
  providers: [
    {
      provide: EMAIL_TEMPLATE_REPOSITORY,
      useClass: TypeOrmEmailTemplateRepository,
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
  ],
  controllers: [EmailTemplatesController],
  exports: [EMAIL_TEMPLATE_REPOSITORY, RenderEmailTemplateUseCase],
})
export class EmailTemplatesModule {}
