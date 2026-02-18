import { Module } from '@nestjs/common';
import { ChatGateway } from './chat.gateway';
import { ChatService } from './chat.service';
import { ChatController } from './chat.controller';
import { SessionsModule } from '../sessions/sessions.module';
import { PrismaModule } from '../../database/prisma/prisma.module';

@Module({
    imports: [PrismaModule, SessionsModule],
    controllers: [ChatController],
    providers: [ChatGateway, ChatService],
    exports: [ChatService],
})
export class ChatModule {}
