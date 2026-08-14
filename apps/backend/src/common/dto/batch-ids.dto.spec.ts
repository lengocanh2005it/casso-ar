import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { BatchIdsDto } from './batch-ids.dto';

describe('BatchIdsDto', () => {
  const uuid = (n: number) =>
    `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

  it('rejects an empty ids array', async () => {
    const dto = plainToInstance(BatchIdsDto, { ids: [] });
    const errors = await validate(dto);
    expect(errors.some((error) => error.property === 'ids')).toBe(true);
  });

  it('rejects more than 50 ids', async () => {
    const dto = plainToInstance(BatchIdsDto, {
      ids: Array.from({ length: 51 }, (_, i) => uuid(i)),
    });
    const errors = await validate(dto);
    expect(errors.some((error) => error.property === 'ids')).toBe(true);
  });

  it('accepts between 1 and 50 valid UUIDs', async () => {
    const dto = plainToInstance(BatchIdsDto, {
      ids: [uuid(1), uuid(2)],
    });
    expect(await validate(dto)).toHaveLength(0);
  });
});
