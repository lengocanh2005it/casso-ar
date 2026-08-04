import type { FindOptionsWhere, Repository } from 'typeorm';
import type { TenantContextService } from './tenant-context';

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
