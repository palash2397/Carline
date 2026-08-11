import { Module } from '@nestjs/common';
import { SuperAdminService } from './super-admin.service';
import { SuperAdminController } from './super-admin.controller';

import { User, UserSchema } from '../user/schema/user.schema';
import { MongooseModule } from '@nestjs/mongoose';
import { Driver, DriverSchema } from '../driver/schema/driver.schema';

@Module({
  controllers: [SuperAdminController],
  providers: [SuperAdminService],
  exports: [SuperAdminService],
  imports: [
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: Driver.name, schema: DriverSchema },
    ]),
  ],
})
export class SuperAdminModule {}
