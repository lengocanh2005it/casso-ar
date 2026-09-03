import type { QueryRunner } from 'typeorm';
import { AddBankTransactionAiRecommendation20260908000000 } from './20260908000000-add-bank-transaction-ai-recommendation';

describe('AddBankTransactionAiRecommendation20260908000000', () => {
  it('adds only a nullable JSONB recommendation column', async () => {
    const migration = new AddBankTransactionAiRecommendation20260908000000();
    const query = jest.fn().mockResolvedValue([]);

    await migration.up({ query } as unknown as QueryRunner);

    expect(query).toHaveBeenCalledWith(
      'ALTER TABLE "bank_transactions" ADD COLUMN IF NOT EXISTS "aiRecommendation" jsonb',
    );
  });

  it('reverts by dropping the recommendation column', async () => {
    const migration = new AddBankTransactionAiRecommendation20260908000000();
    const query = jest.fn().mockResolvedValue([]);

    await migration.down({ query } as unknown as QueryRunner);

    expect(query).toHaveBeenCalledWith(
      'ALTER TABLE "bank_transactions" DROP COLUMN IF EXISTS "aiRecommendation"',
    );
  });
});
