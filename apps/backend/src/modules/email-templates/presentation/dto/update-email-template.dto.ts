import { IsOptional, IsString, MinLength } from 'class-validator';
import { IsAllowedEmailTemplateVariables } from './email-template-variables.validator';

export class UpdateEmailTemplateDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @IsAllowedEmailTemplateVariables()
  subject?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @IsAllowedEmailTemplateVariables()
  bodyHtml?: string;
}
