import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from './database/databese.module';
import { UserModule } from './modules/user/user.module';
import { AuthModule } from './modules/auth/auth.module';
import { AddressModule } from './modules/address/address.module';
import { FaqModule } from './modules/faq/faq.module';
import { SupportModule } from './modules/support/support.module';
import { SocketModule } from './modules/socket/socket.module';
import { ChatModule } from './modules/chat/chat.module';
import { RatingModule } from './modules/rating/rating.module';
import { SuperAdminModule } from './modules/super-admin/super-admin.module';
import { MailModule } from './modules/mail/mail.module';
import { DriverModule } from './modules/driver/driver.module';
import { CustomerModule } from './modules/customer/customer.module';
import { RideModule } from './modules/ride/ride.module';
import { IvrModule } from './modules/ivr/ivr.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    DatabaseModule,
    UserModule,
    AuthModule,
    AddressModule,
    FaqModule,
    SupportModule,
    SocketModule,
    ChatModule,
    RatingModule,
    SuperAdminModule,
    MailModule,
    DriverModule,
    CustomerModule,
    RideModule,
    IvrModule,
  ],
  controllers: [AppController],
  providers: [],
})
export class AppModule {}
