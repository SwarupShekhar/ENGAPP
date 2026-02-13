import { Module, Global } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { ClerkGuard } from './clerk.guard';
import { ClerkService } from '../../integrations/clerk.service';

@Global()
@Module({
  imports: [],
  controllers: [AuthController],
  providers: [AuthService, ClerkGuard],
  exports: [AuthService, ClerkGuard],
})
export class AuthModule { }