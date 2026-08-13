import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ListCustomersQueryDto } from './list-customers-query.dto';

describe('ListCustomersQueryDto', () => {
  it('rejects a search term longer than 100 characters', async () => {
    const dto = plainToInstance(ListCustomersQueryDto, {
      search: 'a'.repeat(101),
    });
    const errors = await validate(dto);
    expect(errors.some((error) => error.property === 'search')).toBe(true);
  });

  it('accepts a reasonable search term', async () => {
    const dto = plainToInstance(ListCustomersQueryDto, {
      search: 'acme',
    });
    expect(await validate(dto)).toHaveLength(0);
  });
});
