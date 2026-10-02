import type { QueryRunner } from 'typeorm';
import { AddExactInvoiceReferenceIndexes20261002000000 } from './20261002000000-add-exact-invoice-reference-indexes';

describe('AddExactInvoiceReferenceIndexes20261002000000', () => {
  function makeRunner() {
    const query = jest.fn().mockResolvedValue([]);
    return { query, runner: { query } as unknown as QueryRunner };
  }

  it('indexes the normalized invoice number per organization and receivables by invoice', async () => {
    const { query, runner } = makeRunner();
    await new AddExactInvoiceReferenceIndexes20261002000000().up(runner);

    expect(query).toHaveBeenCalledTimes(2);
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining(
        `"invoices" ("organizationId", (upper(regexp_replace("invoiceNumber", '[^A-Za-z0-9]', '', 'g'))))`,
      ),
    );
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('"receivables" ("organizationId", "invoiceId")'),
    );
  });

  it('drops both indexes on down', async () => {
    const { query, runner } = makeRunner();
    await new AddExactInvoiceReferenceIndexes20261002000000().down(runner);

    expect(query).toHaveBeenCalledWith(
      'DROP INDEX IF EXISTS "IDX_receivables_organization_invoice"',
    );
    expect(query).toHaveBeenCalledWith(
      'DROP INDEX IF EXISTS "IDX_invoices_organization_normalized_number"',
    );
  });
});
