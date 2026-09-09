import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class UpdateDriverDto {
  @ApiProperty({
    example: '691aa8f81c36af5462c4551c',
    description: 'Driver ID',
    required: true,
  })
  @IsNotEmpty()
  @IsString()
  id: string;

  @ApiProperty({
    example: 'Rafoel Konig',
    description: 'Driver Full Name',
    required: false,
  })
  @IsOptional()
  @IsString()
  driverName?: string;

  @ApiProperty({
    example: '5513380418',
    description: 'Mobile Number',
    required: false,
  })
  @IsOptional()
  @IsString()
  mobileNumber?: string;

  @ApiProperty({
    example: 'rafoelkonig@gmail.com',
    description: 'Email Address',
    required: false,
  })
  @IsOptional()
  @IsString()
  email?: string;

  @ApiProperty({
    example: '123 Main St, Raleigh, NC',
    description: 'Address',
    required: false,
  })
  @IsOptional()
  @IsString()
  address?: string;

  @ApiProperty({
    example: 'Taxi / Cab',
    description: 'Vehicle Make / Type',
    required: false,
  })
  @IsOptional()
  @IsString()
  makeModel?: string;

  @ApiProperty({
    example: 'DL-0011',
    description: 'License Number',
    required: false,
  })
  @IsOptional()
  @IsString()
  licenceNumber?: string;

  @ApiProperty({
    example: 'Local Rides',
    description: 'Assigned Queue',
    required: false,
  })
  @IsOptional()
  @IsString()
  assignQueue?: string;
}
