import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../common/auth/jwt-auth.guard';
import { ListLedgerEventsUseCase } from '../application/list-ledger-events.usecase';
import { LedgerEventListResponseDto } from './dto/ledger-event-response.dto';
import { ListLedgerEventsQueryDto } from './dto/list-ledger-events.query';

@ApiTags('ledger')
@UseGuards(JwtAuthGuard)
@Controller('ledger/events')
export class LedgerController {
  constructor(private readonly listLedgerEvents: ListLedgerEventsUseCase) {}

  @Get()
  @ApiOperation({ summary: 'List AR ledger events for a subject' })
  @ApiOkResponse({ type: LedgerEventListResponseDto })
  async list(@Query() query: ListLedgerEventsQueryDto) {
    return this.listLedgerEvents.execute({
      filters: {
        subjectType: query.subjectType,
        subjectId: query.subjectId,
        kind: query.kind,
      },
      page: query.page,
      limit: query.limit,
    });
  }
}
