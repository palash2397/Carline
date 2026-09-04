import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type PricingRuleDocument = PricingRule & Document;

@Schema({ timestamps: true })
export class PricingRule {
  @Prop({ type: Number, default: 2.0 })
  baseFare: number;

  @Prop({ type: Number, default: 5 })
  baseTimeMinutes: number;

  @Prop({ type: Number, default: 2.0 })
  perMinuteRate: number;

  @Prop({ type: String, default: 'USD' })
  currency: string;
}

export const PricingRuleSchema = SchemaFactory.createForClass(PricingRule);
