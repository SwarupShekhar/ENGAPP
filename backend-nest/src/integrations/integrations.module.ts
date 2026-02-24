import { Module, Global } from '@nestjs/common';
import { FastApiClient } from './fastapi.client';
import { AzureStorageService } from './azure-storage.service';
import { ClerkService } from './clerk.service';
import { MuxService } from './mux.service';

@Global()
@Module({
  providers: [FastApiClient, AzureStorageService, ClerkService, MuxService],
  exports: [FastApiClient, AzureStorageService, ClerkService, MuxService],
})
export class IntegrationsModule {}
