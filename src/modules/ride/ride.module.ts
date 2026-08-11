import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { RideService } from './ride.service';
import { RideController } from './ride.controller';
import { RideGateway } from './ride.gateway';

import { Ride, RideSchema } from './schema/ride.schema';
import { Driver, DriverSchema } from '../driver/schema/driver.schema';
import { User, UserSchema } from '../user/schema/user.schema';
import { RideType, RideTypeSchema } from '../ride-type/schema/ride-type.schema';

@Module({
  controllers: [RideController],
  providers: [RideService, RideGateway],
  imports: [
    MongooseModule.forFeature([
      {
        name: Ride.name,
        schema: RideSchema,
      },
      {
        name: Driver.name,
        schema: DriverSchema,
      },
      {
        name: User.name,
        schema: UserSchema,
      },
      {
        name: RideType.name,
        schema: RideTypeSchema,
      },
    ]),
  ],
  exports: [
    RideService,
    MongooseModule.forFeature([
      {
        name: Ride.name,
        schema: RideSchema,
      },
    ]),
  ],
})
export class RideModule {}
