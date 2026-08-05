import type { EntityManager, FindOptionsWhere, Repository } from 'typeorm';
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

  // Writes through a transaction's EntityManager when one is given, falls
  // back to the injected repository otherwise — collapses the manager-branch
  // every write-side repository was hand-rolling.
  protected async scopedSaveWithManager(
    entity: TEntity,
    manager?: EntityManager,
    explicitOrganizationId?: string,
  ): Promise<void> {
    const organizationId =
      explicitOrganizationId ?? this.tenantContext.getOrganizationId();
    if (entity.organizationId && entity.organizationId !== organizationId) {
      throw new Error('TENANT_MISMATCH');
    }
    const scoped = { ...entity, organizationId } as TEntity;
    const repo = manager
      ? manager.getRepository<TEntity>(this.ormRepo.target)
      : this.ormRepo;
    await repo.save(scoped);
  }
}
