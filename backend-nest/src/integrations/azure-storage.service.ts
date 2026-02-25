import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  BlobServiceClient,
  generateBlobSASQueryParameters,
  BlobSASPermissions,
  StorageSharedKeyCredential,
} from '@azure/storage-blob';

@Injectable()
export class AzureStorageService {
  private readonly logger = new Logger(AzureStorageService.name);
  private blobServiceClient: BlobServiceClient;
  private containerName: string;
  private sharedKeyCredential: StorageSharedKeyCredential; // Store credential for SAS

  constructor(private configService: ConfigService) {
    const connectionString = this.configService.get<string>(
      'AZURE_STORAGE_CONNECTION_STRING',
    );
    if (!connectionString) {
      this.logger.error('AZURE_STORAGE_CONNECTION_STRING is not defined');
      return;
    }
    this.blobServiceClient =
      BlobServiceClient.fromConnectionString(connectionString);
    this.containerName = 'audio-files'; // Default container Name

    // Parsed from connection string for SAS generation
    // Expected format: DefaultEndpointsProtocol=https;AccountName=...;AccountKey=...;EndpointSuffix=...
    const matches = connectionString.match(
      /AccountName=([^;]+);AccountKey=([^;]+)/,
    );
    if (matches) {
      this.sharedKeyCredential = new StorageSharedKeyCredential(
        matches[1],
        matches[2],
      );
    }
  }

  async uploadFile(file: Buffer, key: string, contentType: string) {
    if (!this.blobServiceClient) {
      throw new Error(
        'Azure Storage not initialized (missing connection string)',
      );
    }
    try {
      const containerClient = this.blobServiceClient.getContainerClient(
        this.containerName,
      );
      await containerClient.createIfNotExists();
      const blockBlobClient = containerClient.getBlockBlobClient(key);
      await blockBlobClient.uploadData(file, {
        blobHTTPHeaders: { blobContentType: contentType },
      });

      // Return SAS URL instead of public URL
      if (this.sharedKeyCredential) {
        return this.generateSasUrl(key);
      }
      return blockBlobClient.url;
    } catch (error) {
      this.logger.error(`Azure upload failed: ${error.message}`);
      throw error;
    }
  }

  async getDownloadUrl(key: string): Promise<string> {
    if (this.sharedKeyCredential) {
      return this.generateSasUrl(key);
    }
    const containerClient = this.blobServiceClient.getContainerClient(
      this.containerName,
    );
    const blockBlobClient = containerClient.getBlockBlobClient(key);
    return blockBlobClient.url;
  }

  private generateSasUrl(blobName: string): string {
    const containerClient = this.blobServiceClient.getContainerClient(
      this.containerName,
    );
    const blobClient = containerClient.getBlobClient(blobName);

    const sasOptions = {
      containerName: this.containerName,
      blobName: blobName,
      permissions: BlobSASPermissions.parse('r'), // Read permission
      startsOn: new Date(),
      expiresOn: new Date(new Date().valueOf() + 3600 * 1000), // 1 hour
    };

    const sasToken = generateBlobSASQueryParameters(
      sasOptions,
      this.sharedKeyCredential,
    ).toString();
    return `${blobClient.url}?${sasToken}`;
  }

  /**
   * Delete a blob from Azure Storage.
   * Used for audio cleanup after processing and data retention enforcement.
   */
  async deleteFile(key: string): Promise<void> {
    if (!this.blobServiceClient) {
      this.logger.warn('Azure Storage not initialized — skipping delete');
      return;
    }
    try {
      const containerClient = this.blobServiceClient.getContainerClient(
        this.containerName,
      );
      const blockBlobClient = containerClient.getBlockBlobClient(key);
      await blockBlobClient.deleteIfExists();
      this.logger.log(`Deleted blob: ${key}`);
    } catch (error) {
      this.logger.error(`Azure delete failed for ${key}: ${error.message}`);
      // Non-critical — log but don't throw
    }
  }
}
