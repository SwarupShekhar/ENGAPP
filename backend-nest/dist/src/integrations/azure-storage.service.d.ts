import { ConfigService } from '@nestjs/config';
export declare class AzureStorageService {
    private configService;
    private readonly logger;
    private blobServiceClient;
    private containerName;
    private sharedKeyCredential;
    constructor(configService: ConfigService);
    uploadFile(file: Buffer, key: string, contentType: string): Promise<string>;
    getDownloadUrl(key: string): Promise<string>;
    private generateSasUrl;
}
