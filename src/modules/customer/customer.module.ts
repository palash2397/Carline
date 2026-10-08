import { forwardRef, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CustomerController } from './customer.controller';
import { CustomerService } from './customer.service';
import { Customer, CustomerSchema } from './schema/customer.schema';
import {
  CustomerBalanceHistory,
  CustomerBalanceHistorySchema,
} from './schema/customer-balance-history.schema';
import { User, UserSchema } from '../user/schema/user.schema';
import { PaymentModule } from '../payment/payment.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Customer.name, schema: CustomerSchema },
      {
        name: CustomerBalanceHistory.name,
        schema: CustomerBalanceHistorySchema,
      },
      { name: User.name, schema: UserSchema },
    ]),
    forwardRef(() => PaymentModule),
  ],
  controllers: [CustomerController],
  providers: [CustomerService],
  exports: [CustomerService],
})
export class CustomerModule {}
