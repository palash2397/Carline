import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class IvrDriverCardDto {
  @ApiProperty({
    example: '3475632341',
    description: 'Caller phone number of the driver',
    required: true,
  })
  @IsNotEmpty()
  @IsString()
  callerNumber: string;

  @ApiProperty({
    example: 'TRIP-321329-706',
    description: 'Trip number of the ride',
    required: true,
  })
  @IsNotEmpty()
  @IsString()
  tripNumber: string;

  @ApiProperty({
    example: '4111111111111111',
    description: 'Customer credit card number entered via IVR',
    required: true,
  })
  @IsNotEmpty()
  @IsString()
  cardNumber: string;

  @ApiProperty({
    example: '12/28',
    description: 'Card expiration date (optional)',
    required: false,
  })
  @IsOptional()
  @IsString()
  expiration?: string;

  @ApiProperty({
    example: '123',
    description: 'CVV security code (optional)',
    required: false,
  })
  @IsOptional()
  @IsString()
  cvv?: string;
}
