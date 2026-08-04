import { Body, Controller, Post } from '@nestjs/common';
import type { CreateReceivableUseCase } from '../application/create-receivable.usecase';
import type { CreateReceivableDto } from './dto/create-receivable.dto';

@Controller('receivables')
export class ReceivablesController {
  constructor(
    private readonly createReceivableUseCase: CreateReceivableUseCase,
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
    return receivable;
  }
}
