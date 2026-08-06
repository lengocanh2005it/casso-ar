import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { IdempotencyModule } from '../../common/idempotency/idempotency.module';
import { CreateEmailTemplateUseCase } from './application/create-email-template.usecase';
import { DeleteEmailTemplateUseCase } from './application/delete-email-template.usecase';
import { EMAIL_TEMPLATE_REPOSITORY } from './application/email-template-repository.port';
import { ListEmailTemplatesUseCase } from './application/list-email-templates.usecase';
import { UpdateEmailTemplateUseCase } from './application/update-email-template.usecase';
import { EmailTemplateOrmEntity } from './infrastructure/email-template.orm-entity';
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
    CreateEmailTemplateUseCase,
    ListEmailTemplatesUseCase,
    UpdateEmailTemplateUseCase,
    DeleteEmailTemplateUseCase,
  ],
  controllers: [EmailTemplatesController],
  exports: [EMAIL_TEMPLATE_REPOSITORY],
})
export class EmailTemplatesModule {}
