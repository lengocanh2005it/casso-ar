import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ExceptionQueuePaginationDto } from './exception-queue-pagination.dto';

describe('ExceptionQueuePaginationDto', () => {
  it('rejects a search term longer than 100 characters', async () => {
    const dto = plainToInstance(ExceptionQueuePaginationDto, {
      search: 'a'.repeat(101),
    });
    const errors = await validate(dto);
    expect(errors.some((error) => error.property === 'search')).toBe(true);
  });

  it('accepts a reasonable search term', async () => {
    const dto = plainToInstance(ExceptionQueuePaginationDto, {
      search: 'nguyen van a',
    });
    expect(await validate(dto)).toHaveLength(0);
  });
});
