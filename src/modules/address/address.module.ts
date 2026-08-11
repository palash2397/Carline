import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { Address, AddressSchema } from './schema/address.schema';
import { User, UserSchema } from '../user/schema/user.schema';

import { AddressController } from './address.controller';
import { AddressService } from './address.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Address.name, schema: AddressSchema },
      { name: User.name, schema: UserSchema },
    ]),
  ],
  controllers: [AddressController],
  providers: [AddressService],

  exports: [
    MongooseModule.forFeature([{ name: Address.name, schema: AddressSchema }]),
  ],
})
export class AddressModule {}
