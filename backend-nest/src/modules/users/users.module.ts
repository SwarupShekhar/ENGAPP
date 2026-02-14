import { Module } from '@nestjs/common';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { PrismaModule } from '../../database/prisma/prisma.module';
import { AuthModule } from '../auth/auth.module'; // Import AuthModule for ClerkGuard

@Module({
    imports: [PrismaModule, AuthModule],
    controllers: [UsersController],
    providers: [UsersService],
    exports: [UsersService],
})
export class UsersModule { }
