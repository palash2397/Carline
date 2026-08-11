import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
} from 'class-validator';

export class AddCompanyCarDto {
  @ApiProperty({ example: 'Honda City ZX' })
  @IsString()
  @IsNotEmpty()
  carName: string;

  @ApiProperty({ example: 'Honda' })
  @IsString()
  @IsNotEmpty()
  vehicleBrand: string;

  @ApiProperty({ example: 'City ZX' })
  @IsString()
  @IsNotEmpty()
  vehicleModel: string;

  @ApiProperty({ example: 2026 })
  @Transform(({ value }) => Number(value))
  @IsNumber()
  @IsNotEmpty()
  manufacturingYear: number;

  @ApiProperty({ example: 'Red' })
  @IsString()
  @IsNotEmpty()
  color: string;

  @ApiProperty({ example: '12345678901234567' })
  @IsString()
  @IsNotEmpty()
  vinNumber: string;

  @ApiProperty({ example: 'MH01AB1234' })
  @IsString()
  @IsNotEmpty()
  registrationNo: string;

  @ApiProperty({ example: 2000 })
  @Transform(({ value }) => Number(value))
  @IsNumber()
  @IsNotEmpty()
  perDayCharge: number;

  @ApiProperty({ example: 'Petrol' })
  @IsString()
  @IsNotEmpty()
  fuelType: string;

  @ApiProperty({ example: 'Manual' })
  @IsString()
  @IsNotEmpty()
  transmission: string;

  @ApiProperty({ example: 5 })
  @Transform(({ value }) => Number(value))
  @IsNumber()
  @IsNotEmpty()
  noOfSeats: number;

  @ApiProperty({ example: 4 })
  @Transform(({ value }) => Number(value))
  @IsNumber()
  @IsNotEmpty()
  noOfDoors: number;

  @ApiProperty({ example: '18 km/l' })
  @IsString()
  @IsNotEmpty()
  mileage: string;

  @ApiProperty({ example: true })
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  airConditioning: boolean;

  @ApiProperty({ example: true })
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  bluetooth: boolean;

  @ApiProperty({ example: true })
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  usb: boolean;

  @ApiProperty({ example: true })
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  gps: boolean;

  @ApiPropertyOptional({ example: 'A nice and clean car.' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ type: [String], format: 'binary', description: 'Up to 6 images' })
  @IsOptional()
  vehiclePhotos?: string[];

  @ApiPropertyOptional({ type: 'string', format: 'binary' })
  @IsOptional()
  insuranceInvoice?: string;

  @ApiPropertyOptional({ type: 'string', format: 'binary' })
  @IsOptional()
  registrationCardImage?: string;
}
