import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class UpdateDriverDetailsDto {
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
  avatar?: any;

  @ApiPropertyOptional({ type: 'string', format: 'binary' })
  nationalIdFront?: any;

  @ApiPropertyOptional({ type: 'string', format: 'binary' })
  nationalIdBack?: any;

  @ApiPropertyOptional({ type: 'string', format: 'binary' })
  driverLicenseFront?: any;

  @ApiPropertyOptional({ type: 'string', format: 'binary' })
  driverLicenseBack?: any;

  @ApiPropertyOptional({ type: 'string', format: 'binary' })
  vehicleRegistrationFront?: any;

  @ApiPropertyOptional({ type: 'string', format: 'binary' })
  vehicleRegistrationBack?: any;

  @ApiPropertyOptional({ type: 'array', items: { type: 'string', format: 'binary' } })
  vehiclePhotos?: any[];
}
