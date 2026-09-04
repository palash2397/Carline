import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsNumber, IsOptional, IsString } from 'class-validator';
import { DriverStatus } from 'src/common/enums/driver/status-enum';

export class CreateDriverDto {
  @ApiProperty({ example: 'John Doe' })
  @IsNotEmpty()
  @IsString()
  driverName: string;

  @ApiProperty({ example: '1234567890' })
  @IsNotEmpty()
  @IsString()
  mobileNumber: string;

  @ApiProperty({ example: 'johndoe@example.com' })
  @IsOptional()
  @IsString()
  email?: string;

  @ApiProperty({ example: '123 Main St' })
  @IsOptional()
  @IsString()
  address?: string;

  @ApiProperty({ example: 'XYZ-1234' })
  @IsOptional()
  @IsString()
  vehicleNumber?: string;

  @ApiProperty({ example: 'LIC987654321' })
  @IsOptional()
  @IsString()
  licenceNumber?: string;

  @ApiProperty({ example: '1' })
  @IsOptional()
  @IsString()
  countryCode?: string;

  @ApiProperty({ example: 'Toyota Camry' })
  @IsOptional()
  @IsString()
  makeModel?: string;

  @ApiProperty({ example: 'White' })
  @IsOptional()
  @IsString()
  color?: string;

  @ApiProperty({ example: DriverStatus.ACTIVE })
  @IsOptional()
  @IsString()
  status?: DriverStatus;

  @ApiProperty({ example: 'Local_Rides' })
  @IsOptional()
  @IsString()
  assignQueue?: string;

  @ApiProperty({ example: 1, description: 'Batch number (1, 2, or 3)' })
  @IsOptional()
  @IsNumber()
  batch?: number;
}
