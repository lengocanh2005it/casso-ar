import { IsIn } from 'class-validator';
import { INVITABLE_ROLES, Role } from '../../domain/membership';

export class UpdateMemberRoleDto {
  @IsIn(INVITABLE_ROLES)
  role: Role;
}
