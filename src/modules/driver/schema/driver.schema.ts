import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type DriverDocument = Driver & Document;

@Schema({ timestamps: true })
export class Driver {
  @Prop({ type: Number })
  driverId: number;

  @Prop()
  driverName: string;

  @Prop()
  mobileNumber: string;

  @Prop()
  email: string;

  @Prop()
  address: string;

  @Prop()
  vehicleNumber: string;

  @Prop()
  licenceNumber: string;

  @Prop()
  countryCode: string;

  @Prop()
  makeModel: string;

  @Prop()
  color: string;

  @Prop()
  alternateNumber: string;

  @Prop()
  status: string;

  @Prop()
  assignQueue: string;

  @Prop()
  loginLogout: string;

  @Prop()
  admOption: string;

  @Prop()
  priority: string;

  @Prop()
  loginTime: string;

  @Prop()
  logoutTime: string;

  @Prop()
  queueTimeStatus: string;

  @Prop({ type: Date })
  lastTripTaken: Date;

  @Prop({ default: 'NO' })
  ongoingRides: string;

  @Prop({ default: 0 })
  earningsWithoutCash: number;

  @Prop({ default: 0 })
  earningsWithCash: number;

  @Prop({ default: 0 })
  totalEarnings: number;

  @Prop({ default: 'On' })
  totalEarningsStatus: string;

  @Prop({ default: 'Disabled' })
  laterTripTrips: string;

  @Prop({ default: 'Enabled' })
  potentialAvailableStatus: string;

  @Prop({ default: 'Enabled' })
  archiveStatus: string;
}

export const DriverSchema = SchemaFactory.createForClass(Driver);
