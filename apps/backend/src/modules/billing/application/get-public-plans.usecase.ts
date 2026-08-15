import { Injectable } from '@nestjs/common';
import { getPlanCatalog, type PlanCatalogEntry } from '../domain/subscription';

@Injectable()
export class GetPublicPlansUseCase {
  execute(): PlanCatalogEntry[] {
    return getPlanCatalog();
  }
}
