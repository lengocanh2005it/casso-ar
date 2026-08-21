import type {
  EntityManager,
  FindOptionsOrder,
  FindOptionsSelect,
  FindOptionsWhere,
  Repository,
} from 'typeorm';
import { TenantContextService } from './tenant-context';

export interface ScopedFindManyOptions<TEntity> {
  select?: FindOptionsSelect<TEntity>;
  order?: FindOptionsOrder<TEntity>;
  skip?: number;
  take?: number;
}

export abstract class BaseRepository<
  TEntity extends { organizationId: string },
> {
  constructor(
    protected readonly ormRepo: Repository<TEntity>,
    protected readonly tenantContext: TenantContextService,
  ) {}

  protected async scopedFindOne(
    where: FindOptionsWhere<TEntity>,
    select?: FindOptionsSelect<TEntity>,
  ): Promise<TEntity | null> {
    const organizationId = this.tenantContext.getOrganizationId();
    return this.ormRepo.findOne({
      where: { ...where, organizationId } as FindOptionsWhere<TEntity>,
      ...(select ? { select } : {}),
    });
  }

  protected async scopedFindMany(
    where: FindOptionsWhere<TEntity> = {} as FindOptionsWhere<TEntity>,
    options: ScopedFindManyOptions<TEntity> = {},
    manager?: EntityManager,
  ): Promise<TEntity[]> {
    const organizationId = this.tenantContext.getOrganizationId();
    const repo = manager
      ? manager.getRepository<TEntity>(this.ormRepo.target)
      : this.ormRepo;
    return repo.find({
      where: { ...where, organizationId } as FindOptionsWhere<TEntity>,
      ...options,
    });
  }

  protected async scopedDelete(
    where: FindOptionsWhere<TEntity>,
    manager?: EntityManager,
  ): Promise<void> {
    const organizationId = this.tenantContext.getOrganizationId();
    const repo = manager
      ? manager.getRepository<TEntity>(this.ormRepo.target)
      : this.ormRepo;
    await repo.delete({
      ...where,
      organizationId,
    } as FindOptionsWhere<TEntity>);
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
