export function getReceivableDisplayName(invoiceNumber: string | null): string {
  return invoiceNumber ?? 'Khoản phải thu';
}
