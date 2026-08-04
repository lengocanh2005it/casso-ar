import { Inject, Injectable } from '@nestjs/common';
import type { Receivable } from '../domain/receivable';
import {
  type IReceivableRepository,
  RECEIVABLE_REPOSITORY,
} from './receivable-repository.port';

@Injectable()
export class ReceivableActionUseCase {
  constructor(
    @Inject(RECEIVABLE_REPOSITORY) private readonly repo: IReceivableRepository,
  ) {}

  async execute(
    receivableId: string,
    action: (r: Receivable) => Receivable,
  ): Promise<void> {
    const r = await this.repo.findById(receivableId);
    if (!r) throw new Error('Receivable not found');
    await this.repo.save(action(r));
  }
}
