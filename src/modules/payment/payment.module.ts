import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PaymentLog, PaymentLogSchema } from './schema/payment-log.schema';
import { Ride, RideSchema } from '../ride/schema/ride.schema';
import { PaymentService } from './payment.service';
import { PaymentController } from './payment.controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: PaymentLog.name, schema: PaymentLogSchema },
      { name: Ride.name, schema: RideSchema },
    ]),
  ],
  controllers: [PaymentController],
  providers: [PaymentService],
  exports: [PaymentService, MongooseModule],
})
export class PaymentModule {}
