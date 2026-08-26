import { ListReminderExecutionsUseCase } from './list-reminder-executions.usecase';
import type { IReminderExecutionRepository } from './reminder-execution-repository.port';

describe('ListReminderExecutionsUseCase', () => {
  it('delegates to the execution repository findPage', async () => {
    const mockItems = [
      { id: 'exec-1', status: 'SENT' },
      { id: 'exec-2', status: 'FAILED' },
    ];
    const executionRepo = {
      findPage: jest.fn().mockResolvedValue({ items: mockItems, total: 2 }),
    };
    const receivableRepo = {
      findByIds: jest.fn().mockResolvedValue(new Map()),
    };
    const customerRepo = { findByIds: jest.fn().mockResolvedValue(new Map()) };
    const invoiceRepo = { findByIds: jest.fn().mockResolvedValue(new Map()) };
    const useCase = new ListReminderExecutionsUseCase(
      executionRepo as unknown as IReminderExecutionRepository,
      receivableRepo as never,
      customerRepo as never,
      invoiceRepo as never,
    );

    const result = await useCase.execute({
      receivableId: 'rec-1',
      page: 1,
      limit: 20,
    });

    expect(executionRepo.findPage).toHaveBeenCalledWith({
      receivableId: 'rec-1',
      page: 1,
      limit: 20,
    });
    expect(result.items).toHaveLength(2);
    expect(result.total).toBe(2);
  });

  it('enriches executions with business labels and preserves null fallbacks', async () => {
    const executionRepo = {
      findPage: jest.fn().mockResolvedValue({
        items: [
          { id: 'exec-1', receivableId: 'rec-1' },
          { id: 'exec-2', receivableId: 'missing' },
        ],
        total: 2,
      }),
    };
    const receivableRepo = {
      findByIds: jest
        .fn()
        .mockResolvedValue(
          new Map([
            ['rec-1', { customerId: 'customer-1', invoiceId: 'invoice-1' }],
          ]),
        ),
    };
    const customerRepo = {
      findByIds: jest
        .fn()
        .mockResolvedValue(new Map([['customer-1', { name: 'Công ty Acme' }]])),
    };
    const invoiceRepo = {
      findByIds: jest
        .fn()
        .mockResolvedValue(
          new Map([['invoice-1', { invoiceNumber: 'INV-001' }]]),
        ),
    };
    const useCase = new ListReminderExecutionsUseCase(
      executionRepo as never,
      receivableRepo as never,
      customerRepo as never,
      invoiceRepo as never,
    );

    await expect(useCase.execute({ page: 1, limit: 20 })).resolves.toEqual({
      items: [
        {
          execution: { id: 'exec-1', receivableId: 'rec-1' },
          invoiceNumber: 'INV-001',
          customerName: 'Công ty Acme',
        },
        {
          execution: { id: 'exec-2', receivableId: 'missing' },
          invoiceNumber: null,
          customerName: null,
        },
      ],
      total: 2,
    });
    expect(receivableRepo.findByIds).toHaveBeenCalledWith(['rec-1', 'missing']);
    expect(customerRepo.findByIds).toHaveBeenCalledWith(['customer-1']);
    expect(invoiceRepo.findByIds).toHaveBeenCalledWith(['invoice-1']);
  });
});
