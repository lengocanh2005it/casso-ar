import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../../common/auth/public.decorator';
import { ApiErrorResponse } from '../../../common/swagger/api-error-response.decorator';
import { ErrorCode } from '../../../common/errors/error-code';
import { AuthCompositeRateLimitGuard } from '../../auth/presentation/auth-composite-rate-limit.guard';
import { LookupTaxCodeUseCase } from '../application/lookup-tax-code.usecase';
import { TaxCodeLookupQueryDto } from './dto/tax-code-lookup-query.dto';
import { TaxCodeLookupResponseDto } from './dto/tax-code-lookup-response.dto';

@ApiTags('tax-verification')
@Controller('tax-verification')
export class TaxVerificationController {
  constructor(private readonly lookupTaxCode: LookupTaxCodeUseCase) {}

  @Get('lookup')
  @Public()
  @UseGuards(AuthCompositeRateLimitGuard)
  @ApiOperation({ summary: 'Look up an organization name by tax code' })
  @ApiOkResponse({ type: TaxCodeLookupResponseDto })
  @ApiErrorResponse(ErrorCode.VALIDATION_ERROR, ErrorCode.RATE_LIMIT_EXCEEDED)
  async lookup(
    @Query() query: TaxCodeLookupQueryDto,
  ): Promise<TaxCodeLookupResponseDto> {
    const result = await this.lookupTaxCode.execute(query.taxCode);
    return { name: result?.name ?? null };
  }
}
