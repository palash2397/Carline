import { ApiProperty } from '@nestjs/swagger';
import {
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsString,
  MaxLength,
} from 'class-validator';

import { AddressType } from 'src/common/enums/user/address.enum';

export class CreateAddressDto {
  @ApiProperty({
    example: '221B Baker Street',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  streetAddress: string;

  @ApiProperty({
    example: '110001',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  postcode: string;

  @ApiProperty({
    example: 'Delhi',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  city: string;

  @ApiProperty({
    example: 'India',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  country: string;

  @ApiProperty({
    enum: AddressType,
    example: AddressType.HOME,
  })
  @IsEnum(AddressType)
  addressType: AddressType;

  @ApiProperty({
    example: 28.6139,
  })
  @IsNumber()
  latitude: number;

  @ApiProperty({
    example: 77.209,
  })
  @IsNumber()
  longitude: number;
}
