import { IsString, MinLength } from 'class-validator';

export class RotateCassoFlowDto {
  @IsString()
  @MinLength(1)
  apiKey: string;
}

export class CassoFlowNewlyDiscoveredAccountDto {
  accountNumber: string;
  bankName: string;
  accountHolderName: string;
}

export class RotateCassoFlowAuthorizationResponseDto {
  rotatedAccountNumbers: string[];
  newlyDiscovered: CassoFlowNewlyDiscoveredAccountDto[];
}
