import { IsEmail, IsEnum } from 'class-validator';
import { Role } from '../../../organizations/domain/membership';

export class InviteMemberDto {
  @IsEmail()
  email: string;

  @IsEnum(Role)
  role: Role;
}
