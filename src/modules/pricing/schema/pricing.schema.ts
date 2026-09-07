import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { ZoneEnum } from 'src/common/enums/pricing/zone.enum';
import { DayOfWeekEnum } from 'src/common/enums/pricing/day-of-week.enum';

export type PricingRuleDocument = PricingRule & Document;

@Schema({ timestamps: true })
export class PricingRule {
  @Prop({ type: String, required: true })
  ruleName: string;

  @Prop({ type: String, enum: ZoneEnum, required: true })
  zone: ZoneEnum;

  @Prop({
    type: [String],
    enum: DayOfWeekEnum,
    default: [
      DayOfWeekEnum.MONDAY,
      DayOfWeekEnum.TUESDAY,
      DayOfWeekEnum.WEDNESDAY,
      DayOfWeekEnum.THURSDAY,
      DayOfWeekEnum.FRIDAY,
      DayOfWeekEnum.SATURDAY,
      DayOfWeekEnum.SUNDAY,
    ],
  })
  days: DayOfWeekEnum[];

  @Prop({ type: Number, default: 0, min: 0, max: 23 })
  startHour: number; // 0 to 23

  @Prop({ type: Number, default: 23, min: 0, max: 23 })
  endHour: number; // 0 to 23

  @Prop({ type: Number, required: true, default: 2.0 })
  baseFare: number;

  @Prop({ type: Number, required: true, default: 5 })
  freeMinutes: number;

  @Prop({ type: Number, required: true, default: 2.0 })
  perMinuteRate: number;

  @Prop({ type: String, default: 'USD' })
  currency: string;

  @Prop({ type: Boolean, default: true })
  isActive: boolean;
}

export const PricingRuleSchema = SchemaFactory.createForClass(PricingRule);
