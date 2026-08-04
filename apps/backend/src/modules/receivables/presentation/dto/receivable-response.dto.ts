import type { Receivable } from '../domain/receivable';

export type ReceivableResponseDto = Omit<Receivable, 'organizationId'> & {
  remainingAmount: number;
};

export const toReceivableResponse = (r: Receivable): ReceivableResponseDto => ({
  ...r,
  remainingAmount: r.originalAmount - r.paidAmount,
});
