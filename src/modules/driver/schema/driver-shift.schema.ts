import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type DriverShiftDocument = DriverShift & Document;

@Schema({ timestamps: true })
export class DriverShift {
  @Prop({ type: String, required: true, index: true })
  driverObjectId: string;

  @Prop({ type: Number, required: true, index: true })
  driverId: number;

  @Prop({ type: String, default: '' })
  driverName: string;

  @Prop({ type: String, required: true, index: true })
  mobileNumber: string;

  @Prop({ type: String, default: 'BOTH' }) // LOCAL, LONG_DISTANCE, BOTH
  queueType: string;

  @Prop({ type: Date, required: true, index: true })
  loginTime: Date;

  @Prop({ type: Date, default: null, index: true })
  logoutTime: Date;

  @Prop({ type: Number, default: 0 })
  durationMinutes: number;

  @Prop({
    type: String,
    enum: ['ACTIVE', 'COMPLETED'],
    default: 'ACTIVE',
    index: true,
  })
  status: string;

  @Prop({
    type: String,
    enum: ['IVR', 'ADMIN', 'SYSTEM'],
    default: 'IVR',
  })
  source: string;

  @Prop({ type: String, default: '' })
  notes: string;
}

export const DriverShiftSchema = SchemaFactory.createForClass(DriverShift);

DriverShiftSchema.index({ driverObjectId: 1, createdAt: -1 });
DriverShiftSchema.index({ driverId: 1, createdAt: -1 });
DriverShiftSchema.index({ mobileNumber: 1, createdAt: -1 });
DriverShiftSchema.index({ driverObjectId: 1, status: 1 });
DriverShiftSchema.index({ status: 1, createdAt: -1 });
DriverShiftSchema.index({ loginTime: -1 });
