import { Module, Global } from '@nestjs/common';
import { FastApiClient } from './fastapi.client';
import { AzureStorageService } from './azure-storage.service';
import { ClerkService } from './clerk.service';

@Global()
@Module({
    providers: [FastApiClient, AzureStorageService, ClerkService],
    exports: [FastApiClient, AzureStorageService, ClerkService],
})
export class IntegrationsModule { }
