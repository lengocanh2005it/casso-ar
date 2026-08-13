import type { FindOptionsWhere, Repository } from 'typeorm';
import { LessThan } from 'typeorm';

export async function deleteOlderThan<T extends object>(
  repo: Repository<T>,
  field: keyof T,
  cutoff: Date,
  extraWhere: Partial<T> = {},
): Promise<number> {
  const result = await repo.delete({
    ...extraWhere,
    [field]: LessThan(cutoff),
  } as FindOptionsWhere<T>);
  return result.affected ?? 0;
}
