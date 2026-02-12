"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AssessmentModule = void 0;
const common_1 = require("@nestjs/common");
const assessment_controller_1 = require("./assessment.controller");
const assessment_service_1 = require("./assessment.service");
const assessment_cleanup_service_1 = require("./assessment-cleanup.service");
const config_1 = require("@nestjs/config");
const integrations_module_1 = require("../../integrations/integrations.module");
const sessions_module_1 = require("../sessions/sessions.module");
const azure_module_1 = require("../azure/azure.module");
const brain_module_1 = require("../brain/brain.module");
const prisma_module_1 = require("../../database/prisma/prisma.module");
const auth_module_1 = require("../auth/auth.module");
let AssessmentModule = class AssessmentModule {
};
exports.AssessmentModule = AssessmentModule;
exports.AssessmentModule = AssessmentModule = __decorate([
    (0, common_1.Module)({
        imports: [config_1.ConfigModule, integrations_module_1.IntegrationsModule, (0, common_1.forwardRef)(() => sessions_module_1.SessionsModule), azure_module_1.AzureModule, brain_module_1.BrainModule, prisma_module_1.PrismaModule, auth_module_1.AuthModule],
        controllers: [assessment_controller_1.AssessmentController],
        providers: [assessment_service_1.AssessmentService, assessment_cleanup_service_1.AssessmentCleanupService],
        exports: [assessment_service_1.AssessmentService],
    })
], AssessmentModule);
//# sourceMappingURL=assessment.module.js.map