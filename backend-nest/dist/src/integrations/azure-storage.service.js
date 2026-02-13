"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var AzureStorageService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.AzureStorageService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const storage_blob_1 = require("@azure/storage-blob");
let AzureStorageService = AzureStorageService_1 = class AzureStorageService {
    constructor(configService) {
        this.configService = configService;
        this.logger = new common_1.Logger(AzureStorageService_1.name);
        const connectionString = this.configService.get('AZURE_STORAGE_CONNECTION_STRING');
        if (!connectionString) {
            this.logger.error('AZURE_STORAGE_CONNECTION_STRING is not defined');
            return;
        }
        this.blobServiceClient = storage_blob_1.BlobServiceClient.fromConnectionString(connectionString);
        this.containerName = 'audio-files';
        const matches = connectionString.match(/AccountName=([^;]+);AccountKey=([^;]+)/);
        if (matches) {
            this.sharedKeyCredential = new storage_blob_1.StorageSharedKeyCredential(matches[1], matches[2]);
        }
    }
    async uploadFile(file, key, contentType) {
        if (!this.blobServiceClient) {
            throw new Error('Azure Storage not initialized (missing connection string)');
        }
        try {
            const containerClient = this.blobServiceClient.getContainerClient(this.containerName);
            await containerClient.createIfNotExists();
            const blockBlobClient = containerClient.getBlockBlobClient(key);
            await blockBlobClient.uploadData(file, {
                blobHTTPHeaders: { blobContentType: contentType },
            });
            if (this.sharedKeyCredential) {
                return this.generateSasUrl(key);
            }
            return blockBlobClient.url;
        }
        catch (error) {
            this.logger.error(`Azure upload failed: ${error.message}`);
            throw error;
        }
    }
    async getDownloadUrl(key) {
        if (this.sharedKeyCredential) {
            return this.generateSasUrl(key);
        }
        const containerClient = this.blobServiceClient.getContainerClient(this.containerName);
        const blockBlobClient = containerClient.getBlockBlobClient(key);
        return blockBlobClient.url;
    }
    generateSasUrl(blobName) {
        const containerClient = this.blobServiceClient.getContainerClient(this.containerName);
        const blobClient = containerClient.getBlobClient(blobName);
        const sasOptions = {
            containerName: this.containerName,
            blobName: blobName,
            permissions: storage_blob_1.BlobSASPermissions.parse("r"),
            startsOn: new Date(),
            expiresOn: new Date(new Date().valueOf() + 3600 * 1000),
        };
        const sasToken = (0, storage_blob_1.generateBlobSASQueryParameters)(sasOptions, this.sharedKeyCredential).toString();
        return `${blobClient.url}?${sasToken}`;
    }
};
exports.AzureStorageService = AzureStorageService;
exports.AzureStorageService = AzureStorageService = AzureStorageService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService])
], AzureStorageService);
//# sourceMappingURL=azure-storage.service.js.map