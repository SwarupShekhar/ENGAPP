import { Module } from '@nestjs/common';
import { LivekitService } from './livekit.service';
import { LivekitController } from './livekit.controller';
import { ConfigModule } from '@nestjs/config';
import { RealtimeAudioGateway } from './realtime-audio.gateway';
import { IntegrationsModule } from '../../integrations/integrations.module';
import { SessionsModule } from '../sessions/sessions.module';
import { AzureModule } from '../azure/azure.module';

@Module({
    imports: [ConfigModule, IntegrationsModule, SessionsModule, AzureModule],
    controllers: [LivekitController],
    providers: [LivekitService, RealtimeAudioGateway],
    exports: [LivekitService],
})
export class LivekitModule { }
