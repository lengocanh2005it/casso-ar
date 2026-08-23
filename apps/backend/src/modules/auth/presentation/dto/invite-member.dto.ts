import { IsEmail, IsIn } from 'class-validator';
import {
  INVITABLE_ROLES,
  Role,
} from '../../../organizations/domain/membership';

export class InviteMemberDto {
  @IsEmail()
  email: string;

  @IsIn(INVITABLE_ROLES)
  role: Role;
}
