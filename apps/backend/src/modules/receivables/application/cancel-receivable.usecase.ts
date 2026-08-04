import { Inject, Injectable } from '@nestjs/common';
import {
  type IReceivableRepository,
  RECEIVABLE_REPOSITORY,
} from './receivable-repository.port';

export interface CancelReceivableInput {
  receivableId: string;
}

@Injectable()
export class CancelReceivableUseCase {
  constructor(
    @Inject(RECEIVABLE_REPOSITORY)
    private readonly receivableRepo: IReceivableRepository,
  ) {}

  async execute(input: CancelReceivableInput): Promise<void> {
    const receivable = await this.receivableRepo.findById(input.receivableId);
    if (!receivable) {
      throw new Error('Receivable not found');
    }
    const updated = receivable.cancel();
    await this.receivableRepo.save(updated);
  }
}
