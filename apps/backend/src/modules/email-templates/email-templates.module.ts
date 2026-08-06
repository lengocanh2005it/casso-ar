import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EMAIL_TEMPLATE_REPOSITORY } from './application/email-template-repository.port';
import { EmailTemplateOrmEntity } from './infrastructure/email-template.orm-entity';
import { TypeOrmEmailTemplateRepository } from './infrastructure/typeorm-email-template.repository';

@Module({
  imports: [TypeOrmModule.forFeature([EmailTemplateOrmEntity])],
  providers: [
    {
      provide: EMAIL_TEMPLATE_REPOSITORY,
      useClass: TypeOrmEmailTemplateRepository,
    },
  ],
  exports: [EMAIL_TEMPLATE_REPOSITORY],
})
export class EmailTemplatesModule {}
