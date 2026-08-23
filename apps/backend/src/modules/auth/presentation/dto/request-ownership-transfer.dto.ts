import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsUUID } from 'class-validator';

export class RequestOwnershipTransferDto {
  @ApiProperty({
    description: 'The user ID of the target who will become the new OWNER',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @IsUUID()
  @IsNotEmpty()
  targetUserId: string;

  @ApiProperty({
    description: "The current owner's password for verification",
    example: 'SuperSecret123!',
  })
  @IsString()
  @IsNotEmpty()
  currentPassword: string;
}
