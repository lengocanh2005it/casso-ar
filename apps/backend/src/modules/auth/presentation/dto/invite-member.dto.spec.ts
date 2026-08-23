import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { Role } from '../../../organizations/domain/membership';
import { InviteMemberDto } from './invite-member.dto';

describe('InviteMemberDto', () => {
  it('rejects role OWNER', async () => {
    const dto = plainToInstance(InviteMemberDto, {
      email: 'a@b.com',
      role: Role.OWNER,
    });
    const errors = await validate(dto);
    expect(errors.some((error) => error.property === 'role')).toBe(true);
  });

  it('accepts a non-OWNER role', async () => {
    const dto = plainToInstance(InviteMemberDto, {
      email: 'a@b.com',
      role: Role.ACCOUNTANT,
    });
    expect(await validate(dto)).toHaveLength(0);
  });
});
