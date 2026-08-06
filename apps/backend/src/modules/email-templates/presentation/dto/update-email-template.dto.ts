import { IsOptional, IsString, MinLength } from 'class-validator';

export class UpdateEmailTemplateDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  subject?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  bodyHtml?: string;
}
