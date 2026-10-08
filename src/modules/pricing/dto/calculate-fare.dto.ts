import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class CalculateFareDto {
  @ApiProperty({
    example: '1',
    description: 'Zone number (1, 2, 3, 4) or Zone Enum',
  })
  @IsNotEmpty()
  @IsString()
  zone: string;

  @ApiProperty({
    example: 5,
    description: 'Duration of the trip in minutes',
    default: 5,
  })
  @IsNotEmpty()
  @IsNumber()
  @Min(0)
  durationMinutes: number;

  @ApiProperty({
    example: '2026-10-07T22:37:17Z',
    description: 'Optional ride start date-time in ISO UTC format (defaults to current time)',
    required: false,
  })
  @IsOptional()
  @IsString()
  startDateTime?: string;
}
