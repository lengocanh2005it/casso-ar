import { ArrayMinSize, IsArray, IsString, MinLength } from 'class-validator';

export class ConfirmCassoFlowDto {
  @IsString()
  @MinLength(1)
  apiKey: string;

  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  selectedAccountNumbers: string[];
}

export class ConnectCassoFlowConnectedItemDto {
  connectionId: string;
  accountNumber: string;
}

export class ConnectCassoFlowSkippedItemDto {
  accountNumber: string;
  reason: 'PLAN_LIMIT_EXCEEDED' | 'TAKEN_BY_ANOTHER_ORG';
}

export class ConnectCassoFlowResponseDto {
  connected: ConnectCassoFlowConnectedItemDto[];
  skipped: ConnectCassoFlowSkippedItemDto[];
}
