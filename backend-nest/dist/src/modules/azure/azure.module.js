"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AzureModule = void 0;
const common_1 = require("@nestjs/common");
const axios_1 = require("@nestjs/axios");
const config_1 = require("@nestjs/config");
const azure_service_1 = require("./azure.service");
let AzureModule = class AzureModule {
};
exports.AzureModule = AzureModule;
exports.AzureModule = AzureModule = __decorate([
    (0, common_1.Module)({
        imports: [config_1.ConfigModule, axios_1.HttpModule.register({
                timeout: 120000,
                maxContentLength: 100 * 1024 * 1024,
                maxBodyLength: 100 * 1024 * 1024,
            })],
        providers: [azure_service_1.AzureService],
        exports: [azure_service_1.AzureService]
    })
], AzureModule);
//# sourceMappingURL=azure.module.js.map