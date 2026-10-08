import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type CustomerBalanceHistoryDocument = CustomerBalanceHistory & Document;

export enum BalanceAdjustmentType {
  ADD = 'ADD',
  DEDUCT = 'DEDUCT',
}

@Schema({ timestamps: true })
export class CustomerBalanceHistory {
  @Prop({ type: Types.ObjectId, ref: 'Customer', required: true, index: true })
  customerObjectId: Types.ObjectId;

  @Prop({ type: Number, index: true })
  customerId?: number;

  @Prop({ type: String, index: true })
  mobileNumber?: string;

  @Prop({
    type: String,
    enum: BalanceAdjustmentType,
    required: true,
  })
  action: BalanceAdjustmentType;

  @Prop({ type: Number, required: true })
  amount: number;

  @Prop({ type: Number, required: true })
  previousBalance: number;

  @Prop({ type: Number, required: true })
  newBalance: number;

  @Prop({ type: String, default: '' })
  reason: string;

  @Prop({
    type: {
      userId: { type: String },
      name: { type: String },
      email: { type: String },
      role: { type: String },
    },
    default: {},
  })
  adjustedBy: {
    userId?: string;
    name?: string;
    email?: string;
    role?: string;
  };
}

export const CustomerBalanceHistorySchema =
  SchemaFactory.createForClass(CustomerBalanceHistory);

CustomerBalanceHistorySchema.index({ customerObjectId: 1, createdAt: -1 });
CustomerBalanceHistorySchema.index({ customerId: 1, createdAt: -1 });
CustomerBalanceHistorySchema.index({ mobileNumber: 1, createdAt: -1 });
