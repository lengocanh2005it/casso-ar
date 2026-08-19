export interface TaxCodeLookupResult {
  name: string;
}

/**
 * Never throws — resolves `null` for "not found", timeout, network error, or
 * a non-OK/malformed VietQR response. Callers treat `null` the same as a
 * confirmed mismatch: fall back to manual review, never block the caller.
 */
export interface ITaxCodeLookupAdapter {
  lookup(taxCode: string): Promise<TaxCodeLookupResult | null>;
}

export const TAX_CODE_LOOKUP_ADAPTER = Symbol('TAX_CODE_LOOKUP_ADAPTER');
