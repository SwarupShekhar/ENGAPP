import { Module } from '@nestjs/common';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { PrismaModule } from '../../database/prisma/prisma.module';
import { AuthModule } from '../auth/auth.module'; // Import AuthModule for ClerkGuard
import { TasksModule } from '../tasks/tasks.module';

@Module({
    imports: [PrismaModule, AuthModule, TasksModule],
    controllers: [UsersController],
    providers: [UsersService],
    exports: [UsersService],
})
export class UsersModule { }
