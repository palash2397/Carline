import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import mongoose, { HydratedDocument, Types } from 'mongoose';

import { UserRole } from 'src/common/enums/user/role.enum';

import { User } from 'src/modules/user/schema/user.schema';
import { Driver } from 'src/modules/driver/schema/driver.schema';
import { RideType } from 'src/modules/ride-type/schema/ride-type.schema';
import { RideStatus } from 'src/common/enums/ride/ride-enum';
import { CounterBy } from 'src/common/enums/ride/counter-enum';

export type RideDocument = HydratedDocument<Ride>;

@Schema({ timestamps: true })
export class Ride {
  @Prop({
    type: mongoose.Schema.Types.ObjectId,
    ref: User.name,
    required: true,
  })
  user: Types.ObjectId;

  @Prop({
    type: mongoose.Schema.Types.ObjectId,
    ref: Driver.name,
    default: null,
  })
  driver?: Types.ObjectId | null;

  @Prop({
    type: mongoose.Schema.Types.ObjectId,
    ref: RideType.name,
    required: true,
  })
  rideType: Types.ObjectId;

  @Prop({ type: String, required: true, trim: true })
  pickupAddress: string;

  @Prop({
    type: {
      type: String,
      enum: ['Point'],
      default: 'Point',
    },
    coordinates: {
      type: [Number],
      required: true,
    },
  })
  pickupLocation: {
    type: string;
    coordinates: number[];
  };

  @Prop({ type: Number, required: true })
  pickupLatitude: number;

  @Prop({ type: Number, required: true })
  pickupLongitude: number;

  @Prop({ type: String, required: true, trim: true })
  destinationAddress: string;

  @Prop({ type: Number, required: true })
  destinationLatitude: number;

  @Prop({ type: Number, required: true })
  destinationLongitude: number;

  @Prop({ type: Number, required: true })
  distance: number;

  @Prop({ type: Number, required: true })
  estimatedTime: number;

  @Prop({ type: Number, required: true })
  estimatedFare: number;

  @Prop({
    type: Number,
    required: true,
  })
  currentFare: number;

  @Prop({
    default: 0,
  })
  negotiationRound: number;

  @Prop({
    enum: CounterBy,
    default: CounterBy.USER,
  })
  lastCounterBy: CounterBy;

  @Prop({
    default: [],
  })
  fareHistory: {
    fare: number;
    offeredBy: CounterBy;
    createdAt: Date;
  }[];

  @Prop({
    type: String,
    enum: RideStatus,
    default: RideStatus.SEARCHING_DRIVER,
  })
  status: RideStatus;

  @Prop({
    type: [{ type: Types.ObjectId, ref: Driver.name }],
    default: [],
  })
  rejectedDrivers: Types.ObjectId[];

  @Prop({
    type: String,
    default: null,
  })
  cancelReason: string;

  @Prop({
    type: String,
    enum: [
      UserRole.PASSENGER,
      UserRole.DRIVER,
      UserRole.USER,
      UserRole.SUPERADMIN,
    ],
    default: null,
  })
  cancelledBy: UserRole;

  @Prop({
    type: [mongoose.Schema.Types.ObjectId],
    ref: Driver.name,
    default: [],
  })
  driverQueue: mongoose.Types.ObjectId[];

  @Prop({
    default: 0,
  })
  currentDriverIndex: number;

  @Prop({
    type: mongoose.Schema.Types.ObjectId,
    ref: Driver.name,
    default: null,
  })
  negotiatingDriver?: mongoose.Types.ObjectId | null;
}

export const RideSchema = SchemaFactory.createForClass(Ride);

RideSchema.index({
  pickupLocation: '2dsphere',
});
