import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { RideController } from './ride.controller';
import { RideService } from './ride.service';
import { Ride, RideSchema } from './schema/ride.schema';
import { CustomerModule } from '../customer/customer.module';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Ride.name, schema: RideSchema }]),
    CustomerModule,
  ],
  controllers: [RideController],
  providers: [RideService],
  exports: [RideService],
})
export class RideModule {}
