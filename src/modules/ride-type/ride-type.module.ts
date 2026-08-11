import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { RideTypeService } from './ride-type.service';
import { RideTypeController } from './ride-type.controller';
import { RideType, RideTypeSchema } from './schema/ride-type.schema';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: RideType.name, schema: RideTypeSchema }]),
  ],
  controllers: [RideTypeController],
  providers: [RideTypeService],
})
export class RideTypeModule {}
