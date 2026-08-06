import { IsOptional, IsString, MinLength } from 'class-validator';
import { IsAllowedEmailTemplateVariables } from './email-template-variables.validator';

export class CreateEmailTemplateDto {
  @IsString()
  @MinLength(2)
  name: string;

  @IsString()
  @MinLength(1)
  @IsAllowedEmailTemplateVariables()
  subject: string;

  @IsString()
  @MinLength(1)
  @IsAllowedEmailTemplateVariables()
  bodyHtml: string;

  @IsOptional()
  @IsString()
  reminderStage?: string;
}
