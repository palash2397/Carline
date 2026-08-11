import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type CompanyCarDocument = HydratedDocument<CompanyCar>;

@Schema({
  timestamps: true,
  versionKey: false,
})
export class CompanyCar {
  @Prop({ type: Types.ObjectId, ref: 'Company', required: true })
  companyId: Types.ObjectId;

  @Prop({ required: true, trim: true })
  carName: string;

  @Prop({ required: true, trim: true })
  vehicleBrand: string;

  @Prop({ required: true, trim: true })
  vehicleModel: string;

  @Prop({ required: true })
  manufacturingYear: number;

  @Prop({ required: true, trim: true })
  color: string;

  @Prop({ required: true, trim: true })
  vinNumber: string;

  @Prop({ required: true, trim: true })
  registrationNo: string;

  @Prop({ required: true })
  perDayCharge: number;

  @Prop({ required: true, trim: true })
  fuelType: string;

  @Prop({ required: true, trim: true })
  transmission: string;

  @Prop({ required: true })
  noOfSeats: number;

  @Prop({ required: true })
  noOfDoors: number;

  @Prop({ required: true })
  mileage: string;

  @Prop({ required: true, default: false })
  airConditioning: boolean;

  @Prop({ required: true, default: false })
  bluetooth: boolean;

  @Prop({ required: true, default: false })
  usb: boolean;

  @Prop({ required: true, default: false })
  gps: boolean;

  @Prop({ trim: true })
  description?: string;

  @Prop({ type: [String], default: [] })
  vehiclePhotos: string[];

  @Prop({ default: null })
  insuranceInvoice?: string;

  @Prop({ default: null })
  registrationCardImage?: string;
}

export const CompanyCarSchema = SchemaFactory.createForClass(CompanyCar);
