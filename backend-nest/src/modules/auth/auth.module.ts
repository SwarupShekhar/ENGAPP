import { Module, Global } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { ClerkGuard } from './clerk.guard';
import { ClerkService } from '../../integrations/clerk.service';
import { ClerkOrInternalGuard } from '../../guards/clerk-or-internal.guard';
import { MetricsAuthGuard } from '../../guards/metrics-auth.guard';
import { AiWsTokenService } from '../../common/ai-ws-token.service';

@Global()
@Module({
  imports: [],
  controllers: [AuthController],
  providers: [
    AuthService,
    ClerkGuard,
    ClerkOrInternalGuard,
    MetricsAuthGuard,
    AiWsTokenService,
  ],
  exports: [
    AuthService,
    ClerkGuard,
    ClerkOrInternalGuard,
    MetricsAuthGuard,
    AiWsTokenService,
  ],
})
export class AuthModule {}