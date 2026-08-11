import { IsEmail, IsInt, IsString, Max, Min } from 'class-validator';

export class SaveSmtpConfigDto {
  @IsString()
  host: string;

  @IsInt()
  @Min(1)
  @Max(65535)
  port: number;

  @IsString()
  username: string;

  @IsString()
  password: string;

  @IsEmail()
  fromAddress: string;
}
