import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class PostCopilotMessageDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(10_000)
  content: string;
}
