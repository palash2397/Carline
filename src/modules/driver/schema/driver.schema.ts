import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { VerificationStatus } from 'src/common/enums/driver/verification-status.enum';

export type DriverDocument = HydratedDocument<Driver>;

@Schema({ timestamps: true })
export class Driver {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, unique: true })
  user: Types.ObjectId;

  @Prop({ type: String, trim: true })
  nationalIdNumber?: string;

  @Prop({ type: String, trim: true })
  driverLicenseNumber?: string;

  @Prop({ type: String, trim: true })
  brand?: string;

  @Prop({ type: String, trim: true })
  vehicleName?: string;

  @Prop({ type: String, trim: true })
  fuelType?: string;

  @Prop({ type: String, trim: true })
  year?: string;

  @Prop({ type: String, trim: true })
  vehicleRegistrationNumber?: string;

  @Prop({ type: String, default: null })
  nationalIdFront?: string;

  @Prop({ type: String, default: null })
  nationalIdBack?: string;

  @Prop({ type: String, default: null })
  driverLicenseFront?: string;

  @Prop({ type: String, default: null })
  driverLicenseBack?: string;

  @Prop({ type: String, default: null })
  vehicleRegistrationFront?: string;

  @Prop({ type: String, default: null })
  vehicleRegistrationBack?: string;

  @Prop({ type: [String], default: [] })
  vehiclePhotos?: string[];

  @Prop({
    type: String,
    enum: VerificationStatus,
    default: VerificationStatus.PENDING,
  })
  verificationStatus: VerificationStatus;

  @Prop({
    type: {
      type: String,
      enum: ['Point'],
      default: 'Point',
    },
    coordinates: {
      type: [Number],
      default: [0, 0],
    },
  })
  currentLocation: {
    type: string;
    coordinates: number[];
  };

  @Prop({ type: Boolean, default: false })
  isOnline: boolean;
}

export const DriverSchema = SchemaFactory.createForClass(Driver);

DriverSchema.index({ currentLocation: '2dsphere' });
