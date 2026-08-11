import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsString } from 'class-validator';

export class LoginCompanyDto {
  @ApiProperty({
    example: 'admin@abc.com',
  })
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @ApiProperty({
    example: 'Admin@123',
  })
  @IsString()
  @IsNotEmpty()
  password: string;
}
