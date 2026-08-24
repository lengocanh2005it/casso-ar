import { Inject, Injectable } from '@nestjs/common';
import {
  type ITaxCodeLookupAdapter,
  TAX_CODE_LOOKUP_ADAPTER,
  type TaxCodeLookupResult,
} from './tax-code-lookup.port';

@Injectable()
export class LookupTaxCodeUseCase {
  constructor(
    @Inject(TAX_CODE_LOOKUP_ADAPTER)
    private readonly taxCodeLookup: ITaxCodeLookupAdapter,
  ) {}

  execute(taxCode: string): Promise<TaxCodeLookupResult | null> {
    return this.taxCodeLookup.lookup(taxCode);
  }
}
