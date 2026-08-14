import { IsOptional, IsString, MinLength } from 'class-validator';

export class UpdateCopilotDraftDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  subject?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  bodyHtml?: string;
}
