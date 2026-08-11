import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class UpdateDriverBasicDetailsDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  firstName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  lastName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  email?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  gender?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  nationalIdNumber?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  driverLicenseNumber?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  brand?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  vehicleName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  fuelType?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  year?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  vehicleRegistrationNumber?: string;

  // File fields for Swagger UI
  @ApiPropertyOptional({ type: 'string', format: 'binary' })
  @IsOptional()
  avatar?: any;
}
