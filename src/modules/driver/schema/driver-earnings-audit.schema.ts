import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type DriverEarningsAuditDocument = DriverEarningsAudit & Document;

@Schema({ timestamps: true })
export class DriverEarningsAudit {
  @Prop({ type: String, required: true, index: true })
  driverObjectId: string;

  @Prop({ type: Number, required: true, index: true })
  driverId: number;

  @Prop({ type: String })
  driverName: string;

  @Prop({ type: String })
  mobileNumber: string;

  @Prop({
    type: String,
    required: true,
    enum: ['ADJUSTMENT', 'SETTLEMENT', 'MANUAL_OVERRIDE'],
    default: 'ADJUSTMENT',
  })
  actionType: string;

  @Prop({ type: Number, default: 0 })
  previousEarningsWithCash: number;

  @Prop({ type: Number, default: 0 })
  newEarningsWithCash: number;

  @Prop({ type: Number, default: 0 })
  previousEarningsWithoutCash: number;

  @Prop({ type: Number, default: 0 })
  newEarningsWithoutCash: number;

  @Prop({ type: Number, default: 0 })
  previousTotalEarnings: number;

  @Prop({ type: Number, default: 0 })
  newTotalEarnings: number;

  @Prop({ type: Number, default: 0 })
  cashDifference: number;

  @Prop({ type: Number, default: 0 })
  nonCashDifference: number;

  @Prop({ type: Number, default: 0 })
  totalDifference: number;

  @Prop({ type: Number, default: 0 })
  settlementAmount: number;

  @Prop({ type: String, default: null })
  settlementMethod: string; // 'CASH', 'BANK_TRANSFER', 'CHEQUE', etc.

  @Prop({ type: String, default: '' })
  note: string;

  @Prop({ type: String, default: 'ADMIN' })
  updatedBy: string;
}

export const DriverEarningsAuditSchema =
  SchemaFactory.createForClass(DriverEarningsAudit);

DriverEarningsAuditSchema.index({ driverObjectId: 1, createdAt: -1 });
DriverEarningsAuditSchema.index({ driverId: 1, createdAt: -1 });
