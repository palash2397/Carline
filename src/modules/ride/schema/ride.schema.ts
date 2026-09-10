import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type RideDocument = Ride & Document;

@Schema({ timestamps: true })
export class Ride {
  @Prop({ type: Number })
  rideId: number;

  @Prop()
  customerNumber: string;

  @Prop()
  customerName: string;

  @Prop()
  customerSelectOption: string;

  @Prop()
  queueName: string;

  @Prop()
  driverNumber: string;

  @Prop()
  driverName: string;

  @Prop()
  driverSelectOption: string;

  @Prop()
  callDuration: string;

  @Prop()
  payment: string;

  @Prop()
  tripNumber: string;

  @Prop({ type: Number, default: 0 })
  rideAmount: number;

  @Prop()
  paymentType: string;

  @Prop()
  paymentStatus: string;

  @Prop()
  driverAwayMinutes: string;

  @Prop()
  rideStatus: string;

  @Prop()
  rideNotes: string;

  @Prop()
  rideCompletedBy: string;

  @Prop()
  rideStartDateTime: string;

  @Prop()
  ridePaymentDateTime: string;

  @Prop()
  rideCompleteDateTime: string;

  @Prop()
  recordingUrl: string;

  @Prop()
  driverId: string;

  @Prop()
  selectedZone: string;

  @Prop()
  paymentTransactionId: string;

  @Prop()
  paymentAuthCode: string;

  @Prop()
  paymentFailureReason: string;

  @Prop({ type: Object })
  paymentGatewayResponse: any;

  @Prop()
  cardLast4: string;

  @Prop()
  cardMasked: string;

  // Fare Override Audit Fields
  @Prop({ type: Number })
  originalCalculatedFare: number;

  @Prop({ type: Boolean, default: false })
  fareOverrideApplied: boolean;

  @Prop({ type: Number })
  fareOverrideAmount: number;

  @Prop({ type: Number })
  fareOverrideDifference: number;

  @Prop()
  fareOverrideByDriverId: string;

  @Prop({ type: Date })
  fareOverrideAt: Date;
}

export const RideSchema = SchemaFactory.createForClass(Ride);
