import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

import { AddressType } from 'src/common/enums/user/address.enum';

export type AddressDocument = HydratedDocument<Address>;

@Schema({ timestamps: true })
export class Address {
  @Prop({
    type: Types.ObjectId,
    ref: `User`,
    required: true,
  })
  user: Types.ObjectId;

  @Prop({
    type: String,
    required: true,
    trim: true,
  })
  streetAddress: string;

  @Prop({
    type: String,
    required: true,
    trim: true,
  })
  postcode: string;

  @Prop({
    type: String,
    required: true,
    trim: true,
  })
  city: string;

  @Prop({
    type: String,
    required: true,
    trim: true,
  })
  country: string;

  @Prop({
    type: String,
    enum: AddressType,
    required: true,
  })
  addressType: AddressType;

  @Prop({
    type: Number,
    required: true,
  })
  latitude: number;

  @Prop({
    type: Number,
    required: true,
  })
  longitude: number;
}

export const AddressSchema = SchemaFactory.createForClass(Address);
