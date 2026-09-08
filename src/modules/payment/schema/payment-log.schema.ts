import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type PaymentLogDocument = PaymentLog & Document;

@Schema({ timestamps: true })
export class PaymentLog {
  @Prop({ type: String })
  rideId: string;

  @Prop({ type: String })
  tripNumber: string;

  @Prop({ type: String })
  customerNumber: string;

  @Prop({ type: Number, required: true })
  amount: number;

  @Prop({ type: String, default: 'USD' })
  currency: string;

  @Prop({ type: String, required: true })
  paymentType: string; // 'CREDIT_CARD', 'CUSTOMER_ACCOUNT', 'CASH', 'OVERRIDE'

  @Prop({ type: String, required: true })
  status: string; // 'PENDING', 'APPROVED', 'DECLINED', 'REFUNDED', 'FAILED'

  @Prop({ type: String })
  transactionId: string; // USAePay Refnum / Tranz_Id

  @Prop({ type: String })
  authCode: string;

  @Prop({ type: String })
  cardMasked: string; // e.g. "**** **** **** 1111"

  @Prop({ type: Object })
  gatewayResponse: any;

  @Prop({ type: String })
  errorMessage: string;
}

export const PaymentLogSchema = SchemaFactory.createForClass(PaymentLog);
