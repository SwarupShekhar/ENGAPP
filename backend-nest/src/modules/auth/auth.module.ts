import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { ClerkGuard } from './clerk.guard';
import { ClerkService } from '../../integrations/clerk.service';

@Module({
  imports: [],
  controllers: [AuthController],
  providers: [AuthService, ClerkService, ClerkGuard],
  exports: [AuthService, ClerkGuard],
})
export class AuthModule { }