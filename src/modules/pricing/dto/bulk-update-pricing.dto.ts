import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { ZoneEnum } from 'src/common/enums/pricing/zone.enum';
import { DayOfWeekEnum } from 'src/common/enums/pricing/day-of-week.enum';

export class SlotItemDto {
  @ApiProperty({ enum: DayOfWeekEnum, example: DayOfWeekEnum.MONDAY })
  @IsEnum(DayOfWeekEnum)
  day: DayOfWeekEnum;

  @ApiProperty({ example: 1, description: 'Hour from 0 to 23 (e.g. 1 for 1am)' })
  @IsInt()
  @Min(0)
  @Max(23)
  hour: number;
}

export class BulkUpdatePricingDto {
  @ApiProperty({ enum: ZoneEnum, example: ZoneEnum.ZONE_1 })
  @IsEnum(ZoneEnum)
  zone: ZoneEnum;

  @ApiProperty({
    type: [SlotItemDto],
    example: [
      { day: DayOfWeekEnum.MONDAY, hour: 1 },
      { day: DayOfWeekEnum.TUESDAY, hour: 2 },
      { day: DayOfWeekEnum.THURSDAY, hour: 3 },
    ],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SlotItemDto)
  slots: SlotItemDto[];

  @ApiProperty({ example: 16.0, description: 'Base Fare in dollars' })
  @IsNumber()
  @Min(0)
  baseFare: number;

  @ApiProperty({ example: 6, description: 'Minutes included in base fare' })
  @IsNumber()
  @Min(0)
  freeMinutes: number;

  @ApiProperty({ example: 1.5, description: 'Price per minute thereafter' })
  @IsNumber()
  @Min(0)
  perMinuteRate: number;

  @ApiProperty({ example: 'USD', required: false, default: 'USD' })
  @IsOptional()
  @IsString()
  currency?: string;
}
