import { IsEmail, IsString, Matches, MinLength } from 'class-validator';

export class SignupDto {
  @IsString()
  @MinLength(2)
  organizationName: string;

  @IsString()
  @MinLength(2)
  name: string;

  @IsEmail()
  email: string;

  @IsString()
  @MinLength(8)
  password: string;

  @IsString()
  @Matches(/^\d{10}(\d{3})?$/, {
    message: 'Mã số thuế phải gồm 10 hoặc 13 chữ số.',
  })
  taxCode: string;
}
