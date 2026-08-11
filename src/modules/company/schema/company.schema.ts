import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import mongoose, { HydratedDocument } from 'mongoose';

import { UserRole } from 'src/common/enums/user/role.enum';

export type CompanyDocument = HydratedDocument<Company>;

@Schema({
  timestamps: true,
  versionKey: false,
})
export class Company {
  @Prop({
    required: true,
    trim: true,
  })
  adminName: string;

  @Prop({
    required: true,
    trim: true,
  })
  companyName: string;

  @Prop({
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
  })
  email: string;

  @Prop({
    required: true,
    select: false,
  })
  password: string;

  @Prop({
    required: true,
    trim: true,
  })
  ownerName: string;

  @Prop({
    required: true,
    trim: true,
  })
  phoneNumber: string;

  @Prop({
    required: true,
    trim: true,
    uppercase: true,
  })
  gstNumber: string;

  @Prop({
    type: [String],
    default: [],
  })
  documents: string[];

  @Prop({
    required: true,
    trim: true,
  })
  address: string;

  @Prop({
    required: true,
    trim: true,
  })
  city: string;

  @Prop({
    default: true,
  })
  isActive: boolean;

  @Prop({
    default: false,
  })
  isVerified: boolean;

  @Prop({
    enum: UserRole,
    default: UserRole.ADMIN,
    index: true,
  })
  role: UserRole.ADMIN;
}

export const CompanySchema = SchemaFactory.createForClass(Company);
