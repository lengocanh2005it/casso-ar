import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { GetCustomerAgingQueryDto } from './get-customer-aging-query.dto';

async function validationErrors(input: object) {
  return validate(plainToInstance(GetCustomerAgingQueryDto, input));
}

describe('GetCustomerAgingQueryDto', () => {
  it('defaults page to 1 and limit to 20 and accepts an empty query', async () => {
    const dto = plainToInstance(GetCustomerAgingQueryDto, {});

    expect(dto.page).toBe(1);
    expect(dto.limit).toBe(20);
    await expect(validationErrors({})).resolves.toHaveLength(0);
  });

  it('accepts a canonical bucket and a short search', async () => {
    await expect(
      validationErrors({ bucket: 'OVERDUE_8_30', search: 'ACME' }),
    ).resolves.toHaveLength(0);
  });

  it('rejects a bucket outside the canonical set', async () => {
    await expect(
      validationErrors({ bucket: 'OVERDUE_999' }),
    ).resolves.not.toHaveLength(0);
  });

  it('rejects a page below 1', async () => {
    await expect(validationErrors({ page: 0 })).resolves.not.toHaveLength(0);
  });

  it('rejects a limit above 100', async () => {
    await expect(validationErrors({ limit: 101 })).resolves.not.toHaveLength(0);
  });

  it('rejects a search longer than the maximum', async () => {
    await expect(
      validationErrors({ search: 'x'.repeat(101) }),
    ).resolves.not.toHaveLength(0);
  });
});
