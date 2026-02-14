import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { AzureService } from './azure.service';

@Module({
    imports: [ConfigModule, HttpModule.register({
        timeout: 120000, // 2 minutes for audio processing
        maxContentLength: 100 * 1024 * 1024, // 100MB
        maxBodyLength: 100 * 1024 * 1024, // 100MB
    })],
    providers: [AzureService],
    exports: [AzureService]
})
export class AzureModule { }
