import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { DriverController } from './driver.controller';
import { DriverService } from './driver.service';
import { Driver, DriverSchema } from './schema/driver.schema';
import { Ride, RideSchema } from '../ride/schema/ride.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Driver.name, schema: DriverSchema },
      { name: Ride.name, schema: RideSchema },
    ]),
  ],
  controllers: [DriverController],
  providers: [DriverService],
  exports: [DriverService],
})
export class DriverModule {}
