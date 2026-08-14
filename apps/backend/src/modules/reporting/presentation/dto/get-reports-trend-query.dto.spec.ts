import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { GetReportsTrendQueryDto } from './get-reports-trend-query.dto';

async function validationErrors(input: object) {
  return validate(plainToInstance(GetReportsTrendQueryDto, input));
}

describe('GetReportsTrendQueryDto', () => {
  it('accepts an omitted months value', async () => {
    await expect(validationErrors({})).resolves.toHaveLength(0);
  });

  it.each([3, 6, 12])('accepts months = %i', async (months) => {
    await expect(validationErrors({ months })).resolves.toHaveLength(0);
  });

  it('accepts a numeric string months value', async () => {
    await expect(validationErrors({ months: '6' })).resolves.toHaveLength(0);
  });

  it.each([0, 5, 24])('rejects months = %i', async (months) => {
    await expect(validationErrors({ months })).resolves.not.toHaveLength(0);
  });

  it('rejects a non-numeric months value', async () => {
    await expect(validationErrors({ months: 'abc' })).resolves.not.toHaveLength(0);
  });
});
