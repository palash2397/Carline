import { Global, Module, forwardRef } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { MongooseModule } from '@nestjs/mongoose';

import { SocketGateway } from './socket.gateway';
import { SocketService } from './socket.service';

import { Driver, DriverSchema } from '../driver/schema/driver.schema';
import { User, UserSchema } from '../user/schema/user.schema';
import { DriverModule } from '../driver/driver.module';

@Global()
@Module({
  imports: [
    JwtModule.register({
      secret: process.env.JWT_SECRET,
    }),
    MongooseModule.forFeature([
      {
        name: User.name,
        schema: UserSchema,
      },
      {
        name: Driver.name,
        schema: DriverSchema,
      },
    ]),
    forwardRef(() => DriverModule),
  ],
  providers: [SocketGateway, SocketService],
  exports: [SocketService],
})
export class SocketModule {}
