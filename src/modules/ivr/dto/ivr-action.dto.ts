import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class IvrDriverActionDto {
  @ApiProperty({ example: '1234567890' })
  @IsNotEmpty()
  @IsString()
  callerNumber: string;

  @ApiProperty({ example: '1' })
  @IsOptional()
  @IsString()
  dtmfInput?: string;
}

export class IvrDispatchActionDto {
  @ApiProperty({ example: 'customer-0426bfae-09fe-4258-9af8-b003e0114b07', required: false })
  @IsOptional()
  @IsString()
  dispatchId?: string;

  @ApiProperty({ example: 'TRIP-123456', required: false })
  @IsOptional()
  @IsString()
  tripNumber?: string;

  @ApiProperty({ example: '1234567890' })
  @IsNotEmpty()
  @IsString()
  driverNumber: string;

  @ApiProperty({ example: '1' })
  @IsNotEmpty()
  @IsString()
  dtmfInput: string;
}
