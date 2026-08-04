import type { FindOptionsWhere, Repository } from 'typeorm';
// biome-ignore lint/style/useImportType: must be a value import — NestJS DI resolves this constructor param via emitDecoratorMetadata's design:paramtypes, which erases type-only imports to `Function`
import { TenantContextService } from './tenant-context';

export abstract class BaseRepository<
  TEntity extends { organizationId: string },
> {
  constructor(
    protected readonly ormRepo: Repository<TEntity>,
    protected readonly tenantContext: TenantContextService,
  ) {}

  protected async scopedFindOne(
    where: FindOptionsWhere<TEntity>,
  ): Promise<TEntity | null> {
    const organizationId = this.tenantContext.getOrganizationId();
    return this.ormRepo.findOne({
      where: { ...where, organizationId } as FindOptionsWhere<TEntity>,
    });
  }

  protected async scopedSave(entity: TEntity): Promise<void> {
    const organizationId = this.tenantContext.getOrganizationId();
    await this.ormRepo.save({ ...entity, organizationId });
  }
}
