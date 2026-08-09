import { IsNotEmpty, IsString } from 'class-validator';

export class PostCopilotMessageDto {
  @IsString()
  @IsNotEmpty()
  content: string;
}
