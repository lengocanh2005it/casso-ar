import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { Role } from '../../domain/membership';
import { UpdateMemberRoleDto } from './update-member-role.dto';

describe('UpdateMemberRoleDto', () => {
  it('rejects role OWNER', async () => {
    const dto = plainToInstance(UpdateMemberRoleDto, { role: Role.OWNER });
    const errors = await validate(dto);
    expect(errors.some((error) => error.property === 'role')).toBe(true);
  });

  it('accepts a non-OWNER role', async () => {
    const dto = plainToInstance(UpdateMemberRoleDto, { role: Role.VIEWER });
    expect(await validate(dto)).toHaveLength(0);
  });
});
