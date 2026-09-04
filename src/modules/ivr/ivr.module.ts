import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { IvrController } from './ivr.controller';
import { IvrService } from './ivr.service';
import { Driver, DriverSchema } from '../driver/schema/driver.schema';
import { Ride, RideSchema } from '../ride/schema/ride.schema';

import { PricingModule } from '../pricing/pricing.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Driver.name, schema: DriverSchema },
      { name: Ride.name, schema: RideSchema },
    ]),
    PricingModule,
  ],
  controllers: [IvrController],
  providers: [IvrService],
})
export class IvrModule {}
