import { ApiProperty } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { ZoneEnum } from 'src/common/enums/pricing/zone.enum';
import { DayOfWeekEnum } from 'src/common/enums/pricing/day-of-week.enum';

export class CreatePricingRuleDto {
  @ApiProperty({ example: 'Zone 1 Peak Hours Rule' })
  @IsNotEmpty()
  @IsString()
  ruleName: string;

  @ApiProperty({ example: ZoneEnum.ZONE_1, enum: ZoneEnum })
  @IsNotEmpty()
  @IsEnum(ZoneEnum)
  zone: ZoneEnum;

  @ApiProperty({
    example: [DayOfWeekEnum.MONDAY, DayOfWeekEnum.TUESDAY],
    enum: DayOfWeekEnum,
    isArray: true,
  })
  @IsArray()
  @IsEnum(DayOfWeekEnum, { each: true })
  days: DayOfWeekEnum[];

  @ApiProperty({ example: 8, description: 'Start hour of day (0-23)' })
  @IsNotEmpty()
  @IsInt()
  @Min(0)
  @Max(23)
  startHour: number;

  @ApiProperty({ example: 18, description: 'End hour of day (0-23)' })
  @IsNotEmpty()
  @IsInt()
  @Min(0)
  @Max(23)
  endHour: number;

  @ApiProperty({ example: 2.0, description: 'Base fare starting cost' })
  @IsNotEmpty()
  @IsNumber()
  @Min(0)
  baseFare: number;

  @ApiProperty({ example: 5, description: 'Free included minutes' })
  @IsNotEmpty()
  @IsInt()
  @Min(0)
  freeMinutes: number;

  @ApiProperty({ example: 2.0, description: 'Rate per minute after free minutes' })
  @IsNotEmpty()
  @IsNumber()
  @Min(0)
  perMinuteRate: number;

  @ApiProperty({ example: 'USD', required: false })
  @IsOptional()
  @IsString()
  currency?: string;

  @ApiProperty({ example: true, required: false })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
