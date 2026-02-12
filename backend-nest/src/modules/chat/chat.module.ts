import { Module } from '@nestjs/common';
import { ChatGateway } from './chat.gateway';
import { FriendshipModule } from '../friendship/friendship.module';
import { IntegrationsModule } from '../../integrations/integrations.module';
import { PrismaModule } from '../../database/prisma/prisma.module';

@Module({
    imports: [FriendshipModule, IntegrationsModule],
    providers: [ChatGateway],
})
export class ChatModule { }
