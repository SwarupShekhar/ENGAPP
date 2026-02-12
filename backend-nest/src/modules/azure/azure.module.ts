import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AzureService } from './azure.service';

@Module({
    imports: [ConfigModule],
    providers: [AzureService],
    exports: [AzureService],
})
export class AzureModule { }
