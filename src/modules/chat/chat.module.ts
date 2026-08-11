import { Module } from '@nestjs/common';
import { ChatService } from './chat.service';
import { ChatController } from './chat.controller';
import { ChatGateway } from './chat.gateway';

import { MongooseModule } from '@nestjs/mongoose';
import { ChatMessage, ChatMessageSchema } from './schema/chat-message.schema';
import { User, UserSchema } from 'src/modules/user/schema/user.schema';
import { Ride, RideSchema } from 'src/modules/ride/schema/ride.schema';
import { Driver, DriverSchema } from 'src/modules/driver/schema/driver.schema';

import { SocketModule } from 'src/modules/socket/socket.module';

@Module({
  imports: [
    SocketModule,
    MongooseModule.forFeature([
      { name: ChatMessage.name, schema: ChatMessageSchema },
      { name: User.name, schema: UserSchema },
      { name: Ride.name, schema: RideSchema },
      { name: Driver.name, schema: DriverSchema },
    ]),
  ],
  controllers: [ChatController],
  providers: [ChatService, ChatGateway],
  exports: [
    MongooseModule.forFeature([
      { name: ChatMessage.name, schema: ChatMessageSchema },
    ]),
  ],
})
export class ChatModule {}
