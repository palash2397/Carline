import { ApiProperty } from '@nestjs/swagger';
import {
  IsArray,
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { Transform } from 'class-transformer';

export class RegisterCompanyDto {
  @ApiProperty({
    example: 'John Doe',
  })
  @IsString()
  @IsNotEmpty()
  adminName: string;

  @ApiProperty({
    example: 'ABC Technologies Pvt Ltd',
  })
  @IsString()
  @IsNotEmpty()
  companyName: string;

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

  @ApiProperty({
    example: 'John Doe',
  })
  @IsString()
  @IsNotEmpty()
  ownerName: string;

  @ApiProperty({
    example: '9876543210',
  })
  @IsString()
  @IsNotEmpty()
  phoneNumber: string;

  @ApiProperty({
    example: '22AAAAA0000A1Z5',
  })
  @IsString()
  @IsNotEmpty()
  gstNumber: string;

  @ApiProperty({
    example: 'Vijay Nagar, Indore, Madhya Pradesh',
  })
  @IsString()
  address: string;

  @ApiProperty({
    example: ' Indore',
  })
  @IsString()
  city: string;

  @ApiProperty({
    type: [String],
    format: 'binary',
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  documents?: string[];
}
