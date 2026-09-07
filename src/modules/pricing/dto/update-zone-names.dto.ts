import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class UpdateZoneNamesDto {
  @ApiProperty({ example: 'KJ LOCAL', required: false })
  @IsOptional()
  @IsString()
  zone1Name?: string;

  @ApiProperty({ example: 'sami Ghivelos', required: false })
  @IsOptional()
  @IsString()
  zone2Name?: string;

  @ApiProperty({ example: 'To From Ghivelos', required: false })
  @IsOptional()
  @IsString()
  zone3Name?: string;

  @ApiProperty({ example: 'Ghivelos 2 ghivelos', required: false })
  @IsOptional()
  @IsString()
  zone4Name?: string;
}
