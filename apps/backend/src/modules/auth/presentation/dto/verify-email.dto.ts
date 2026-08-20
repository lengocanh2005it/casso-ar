import { IsEmail, Matches } from 'class-validator';

export class VerifyEmailDto {
  @IsEmail()
  email: string;

  @Matches(/^\d{6}$/, { message: 'Mã OTP phải gồm 6 chữ số.' })
  otp: string;
}
