import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional } from 'class-validator';

export class UpdateDriverDocumentsDto {
  // File fields for Swagger UI
  @ApiPropertyOptional({ type: 'string', format: 'binary' })
  @IsOptional()
  nationalIdFront?: any;

  @ApiPropertyOptional({ type: 'string', format: 'binary' })
  @IsOptional()
  nationalIdBack?: any;

  @ApiPropertyOptional({ type: 'string', format: 'binary' })
  @IsOptional()
  driverLicenseFront?: any;

  @ApiPropertyOptional({ type: 'string', format: 'binary' })
  @IsOptional()
  driverLicenseBack?: any;

  @ApiPropertyOptional({ type: 'string', format: 'binary' })
  @IsOptional()
  vehicleRegistrationFront?: any;

  @ApiPropertyOptional({ type: 'string', format: 'binary' })
  @IsOptional()
  vehicleRegistrationBack?: any;

  @ApiPropertyOptional({ type: 'array', items: { type: 'string', format: 'binary' } })
  @IsOptional()
  vehiclePhotos?: any[];
}
