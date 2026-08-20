import { IsString, MinLength } from 'class-validator';

export class PreviewCassoFlowDto {
  @IsString()
  @MinLength(1)
  apiKey: string;
}

export class CassoFlowAccountPreviewDto {
  accountNumber: string;
  bankName: string;
  accountHolderName: string;
  status: 'ALREADY_CONNECTED' | 'TAKEN_BY_ANOTHER_ORG' | 'AVAILABLE';
}

export class PreviewCassoFlowAccountsResponseDto {
  businessId: string;
  accounts: CassoFlowAccountPreviewDto[];
}

export class PreviewCassoFlowAuthorizationRotationResponseDto extends PreviewCassoFlowAccountsResponseDto {
  missingAccountNumbers: string[];
}
