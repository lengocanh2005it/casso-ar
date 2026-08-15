import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../../common/auth/public.decorator';
import { GetPublicPlansUseCase } from '../application/get-public-plans.usecase';
import {
  PlanCatalogEntryDto,
  toPlanCatalogEntryDto,
} from './dto/plan-catalog-entry.dto';

@ApiTags('billing')
@Controller('plans')
export class PublicPlansController {
  constructor(private readonly getPublicPlans: GetPublicPlansUseCase) {}

  @Get()
  @Public()
  @ApiOperation({
    summary: 'List the public plan catalog (pricing and usage limits)',
  })
  @ApiOkResponse({ type: PlanCatalogEntryDto, isArray: true })
  list(): PlanCatalogEntryDto[] {
    return this.getPublicPlans.execute().map(toPlanCatalogEntryDto);
  }
}
