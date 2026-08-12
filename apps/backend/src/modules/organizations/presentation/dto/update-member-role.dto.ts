import { IsEnum } from 'class-validator';
import { Role } from '../../domain/membership';

export class UpdateMemberRoleDto {
  @IsEnum(Role)
  role: Role;
}
