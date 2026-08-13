import { Injectable } from '@nestjs/common';
import { toCsv } from '../../../common/csv/csv-writer';
import { ListReceivablesUseCase } from './list-receivables.usecase';
import type { ReceivableListFilters } from './receivable-repository.port';

export interface ExportReceivablesInput {
  filters: ReceivableListFilters;
  search?: string;
}

export const EXPORT_ROW_LIMIT = 10_000;

@Injectable()
export class ExportReceivablesUseCase {
  constructor(
    private readonly listReceivablesUseCase: ListReceivablesUseCase,
  ) {}

  async execute(
    input: ExportReceivablesInput,
  ): Promise<{ csv: string; truncated: boolean }> {
    const { items, total } = await this.listReceivablesUseCase.execute({
      filters: input.filters,
      ...(input.search ? { search: input.search } : {}),
      page: 1,
      limit: EXPORT_ROW_LIMIT,
    });

    const csv = toCsv(
      [
        'Mã hóa đơn',
        'Khách hàng',
        'Số tiền gốc',
        'Đã thanh toán',
        'Còn lại',
        'Ngày đến hạn',
        'Trạng thái',
        'Quá hạn',
      ],
      items.map((item) => [
        item.invoiceNumber ?? '',
        item.customerName ?? '',
        String(item.receivable.originalAmount),
        String(item.receivable.paidAmount),
        String(item.receivable.remainingAmount),
        item.receivable.dueDate.toISOString().slice(0, 10),
        item.receivable.status,
        item.isOverdue ? 'Có' : 'Không',
      ]),
    );

    return { csv, truncated: total > EXPORT_ROW_LIMIT };
  }
}
