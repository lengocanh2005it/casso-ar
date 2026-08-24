import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MinLength } from 'class-validator';

export const ORGANIZATION_VERIFICATION_METHODS = [
  'TAX_CODE_NAME_MATCH_ONLY',
  'BUSINESS_REGISTRATION_DOCUMENT',
  'PHONE_CALL',
  'OTHER',
] as const;

export class ApproveOrganizationDto {
  @ApiProperty({ enum: ORGANIZATION_VERIFICATION_METHODS })
  @IsIn(ORGANIZATION_VERIFICATION_METHODS)
  verificationMethod: (typeof ORGANIZATION_VERIFICATION_METHODS)[number];

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MinLength(3)
  reason?: string;
}
