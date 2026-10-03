import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ListMembersQueryDto } from './list-members-query.dto';

describe('ListMembersQueryDto', () => {
  it('accepts a supported membership status and pagination', async () => {
    const dto = plainToInstance(ListMembersQueryDto, {
      page: '2',
      limit: '20',
      status: 'BLOCKED',
    });

    expect(await validate(dto)).toHaveLength(0);
    expect(dto.page).toBe(2);
    expect(dto.limit).toBe(20);
  });

  it('rejects an unsupported membership status', async () => {
    const dto = plainToInstance(ListMembersQueryDto, { status: 'PENDING' });
    const errors = await validate(dto);

    expect(errors.some((error) => error.property === 'status')).toBe(true);
  });
});
