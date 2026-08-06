import { IsOptional, IsString, MinLength } from 'class-validator';

export class CreateEmailTemplateDto {
  @IsString()
  @MinLength(2)
  name: string;

  @IsString()
  @MinLength(1)
  subject: string;

  @IsString()
  @MinLength(1)
  bodyHtml: string;

  @IsOptional()
  @IsString()
  reminderStage?: string;
}
