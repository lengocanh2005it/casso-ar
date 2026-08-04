# Invoice/Receivable Import (Excel/CSV) Design

> Sub-spec of [docs/overview.md](../../../docs/overview.md), dependent on [2026-08-03-domain-core-design.md](2026-08-03-domain-core-design.md) (`Invoice`, `Receivable`, `Customer`).

## 1. Import flow & row-level error handling

```
POST /invoices/import
  1. Parse file (xlsx/csv), validate the required column structure:
     customerName, customerTaxCode (optional), customerEmail (optional),
     invoiceNumber, issueDate, dueDate, totalAmount
  2. For each row (process independently; an error in one row does not block other rows):
     a. Validate fields: invoiceNumber is non-empty, dueDate >= issueDate,
        totalAmount is a positive number, and the date format is valid
        → error → add to failedRows and skip this row
     b. Resolve Customer: match by customerTaxCode first (more unique than email);
        if the row has no taxCode, match by customerEmail;
        if not found → automatically create a new Customer
        (organizationId, name, taxCode, and email come from the imported row)
     c. Check for a duplicate invoiceNumber within the same organization
        → if it exists → add to failedRows with reason DUPLICATE_INVOICE_NUMBER and skip
     d. Create the Invoice (sourceType=IMPORT) + corresponding Receivable
        (by default, 1 Invoice = 1 Receivable per the Domain Core spec)
  3. Return the canonical result: { totalRows, successCount, failedRows: [{ rowNumber, data, errors }] }
```

**Partial import**: valid rows are created, invalid rows are skipped and reported in detail — do not roll back the entire file because of one or two bad rows. Each row is processed in its own transaction (create Customer if needed + Invoice + Receivable in one transaction per row), and an error in one row does not affect other rows. The `EntityManager` callback parameter must be passed through every repository/use case that writes data, especially `CreateReceivableUseCase.execute(input, manager)`, so the quota check and insert use the same transaction.

## 2. Out of scope

- Import from a real API/ERP/CRM connector (section 9.4 of the source document excludes this from the internship scope).
- Custom column mapping configuration (column names above are fixed for the MVP).
- Splitting one invoice into multiple receivables during import (only 1-to-1 is supported during import; split manually afterward if needed, according to the 1-to-N relationship designed in Domain Core).

## 3. Open questions (do not block implementation)

- What should the maximum file size/row count be for one import (does this determine whether processing must be asynchronous through a queue rather than synchronous in one request)?
- When automatically creating a new Customer during import, should it receive a separate marker (e.g. `createdVia: IMPORT`) to distinguish it from a manually created Customer?
