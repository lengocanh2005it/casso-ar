import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class RevealCassoFlowApiKeyDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  password: string;
}

export class RevealCassoFlowApiKeyResponseDto {
  @ApiProperty()
  apiKey: string;
}
