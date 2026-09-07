import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { ZoneEnum } from 'src/common/enums/pricing/zone.enum';

export type ZoneNameDocument = ZoneName & Document;

@Schema({ timestamps: true })
export class ZoneName {
  @Prop({ type: String, required: true, default: 'KJ LOCAL' })
  zone1Name: string;

  @Prop({ type: String, required: true, default: 'sami Ghivelos' })
  zone2Name: string;

  @Prop({ type: String, required: true, default: 'To From Ghivelos' })
  zone3Name: string;

  @Prop({ type: String, required: true, default: 'Ghivelos 2 ghivelos' })
  zone4Name: string;
}

export const ZoneNameSchema = SchemaFactory.createForClass(ZoneName);
