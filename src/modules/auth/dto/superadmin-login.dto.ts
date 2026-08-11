import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsString } from 'class-validator';

export class SuperAdminLoginDto {
  @ApiProperty({
    example: 'superadmin@biipbiip.com',
    required: true,
  })
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @ApiProperty({
    example: 'securepassword123',
    required: true,
  })
  @IsString()
  @IsNotEmpty()
  password: string;
}
