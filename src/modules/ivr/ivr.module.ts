import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { IvrController } from './ivr.controller';
import { IvrService } from './ivr.service';
import { Driver, DriverSchema } from '../driver/schema/driver.schema';
import { Ride, RideSchema } from '../ride/schema/ride.schema';
import { User, UserSchema } from '../user/schema/user.schema';
import { Customer, CustomerSchema } from '../customer/schema/customer.schema';

import { PricingModule } from '../pricing/pricing.module';
import { PaymentModule } from '../payment/payment.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Driver.name, schema: DriverSchema },
      { name: Ride.name, schema: RideSchema },
      { name: User.name, schema: UserSchema },
      { name: Customer.name, schema: CustomerSchema },
    ]),
    PricingModule,
    PaymentModule,
  ],
  controllers: [IvrController],
  providers: [IvrService],
})
export class IvrModule {}
