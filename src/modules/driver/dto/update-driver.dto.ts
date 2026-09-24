import { ApiProperty } from '@nestjs/swagger';
import {
  IsBoolean,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
} from 'class-validator';

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
    example: 'K-4282',
    description: 'Vehicle Number',
    required: false,
  })
  @IsOptional()
  @IsString()
  vehicleNumber?: string;

  @ApiProperty({
    example: 'GRAY',
    description: 'Vehicle Color',
    required: false,
  })
  @IsOptional()
  @IsString()
  color?: string;

  @ApiProperty({
    example: '1',
    description: 'Country Code',
    required: false,
  })
  @IsOptional()
  @IsString()
  countryCode?: string;

  @ApiProperty({
    example: '',
    description: 'Alternate Phone Number',
    required: false,
  })
  @IsOptional()
  @IsString()
  alternateNumber?: string;

  @ApiProperty({
    example: 'Local Rides',
    description: 'Assigned Queue',
    required: false,
  })
  @IsOptional()
  @IsString()
  assignQueue?: string;

  @ApiProperty({
    example: 'LOCAL',
    description: 'Queue Type (LOCAL, LONG_DISTANCE, BOTH)',
    required: false,
  })
  @IsOptional()
  @IsString()
  queueType?: string;

  @ApiProperty({
    example: 1,
    description: 'Batch number (1, 2, or 3)',
    required: false,
  })
  @IsOptional()
  @IsNumber()
  batch?: number;

  @ApiProperty({
    example: 'ACTIVE',
    description: 'Driver status (ACTIVE, Block, Unblock, INACTIVE)',
    required: false,
  })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiProperty({
    example: 'START',
    description: 'Login/Logout status (START, STOP)',
    required: false,
  })
  @IsOptional()
  @IsString()
  loginLogout?: string;

  @ApiProperty({
    example: true,
    description: 'Is Driver Logged In',
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  isLoggedIn?: boolean;

  @ApiProperty({
    example: true,
    description: 'Is Driver Available',
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  isAvailable?: boolean;

  @ApiProperty({
    example: 'ADM 1',
    description: 'ADM Option',
    required: false,
  })
  @IsOptional()
  @IsString()
  admOption?: string;

  @ApiProperty({
    example: '1',
    description: 'Priority',
    required: false,
  })
  @IsOptional()
  @IsString()
  priority?: string;

  @ApiProperty({
    example: 'Active',
    description: 'Queue Time Status',
    required: false,
  })
  @IsOptional()
  @IsString()
  queueTimeStatus?: string;

  @ApiProperty({
    example: '2026-09-24T12:00:00.000Z',
    description: 'Login Time',
    required: false,
  })
  @IsOptional()
  @IsString()
  loginTime?: string;

  @ApiProperty({
    example: '2026-09-24T12:00:00.000Z',
    description: 'Logout Time',
    required: false,
  })
  @IsOptional()
  @IsString()
  logoutTime?: string;
}

