import { Module } from '@nestjs/common';
import { FriendshipService } from './friendship.service';
import { FriendshipController } from './friendship.controller';
import { PrismaModule } from '../../database/prisma/prisma.module';

@Module({
    imports: [PrismaModule],
    controllers: [FriendshipController],
    providers: [FriendshipService],
    exports: [FriendshipService],
})
export class FriendshipModule { }
