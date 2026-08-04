import { Body, Controller, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../../common/auth/jwt-auth.guard';
import type { CreateReceivableUseCase } from '../application/create-receivable.usecase';
import type { WriteOffReceivableUseCase } from '../application/write-off-receivable.usecase';
import type { CreateReceivableDto } from './dto/create-receivable.dto';
import { toReceivableResponse } from './dto/receivable-response.dto';

@Controller('receivables')
@UseGuards(JwtAuthGuard)
export class ReceivablesController {
  constructor(
    private readonly createReceivableUseCase: CreateReceivableUseCase,
    private readonly writeOffReceivableUseCase: WriteOffReceivableUseCase,
  ) {}

  @Post()
  async create(@Body() dto: CreateReceivableDto) {
    const receivable = await this.createReceivableUseCase.execute({
      customerId: dto.customerId,
      invoiceId: dto.invoiceId ?? null,
      originalAmount: dto.originalAmount,
      dueDate: new Date(dto.dueDate),
      salesRepresentativeId: dto.salesRepresentativeId ?? null,
    });
    return toReceivableResponse(receivable);
  }

  @Post(':id/write-off')
  async writeOff(@Param('id') id: string) {
    const receivable = await this.writeOffReceivableUseCase.execute(id);
    return toReceivableResponse(receivable);
  }
}
