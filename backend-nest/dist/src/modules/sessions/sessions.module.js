"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SessionsModule = void 0;
const common_1 = require("@nestjs/common");
const bull_1 = require("@nestjs/bull");
const sessions_service_1 = require("./sessions.service");
const sessions_controller_1 = require("./sessions.controller");
const sessions_processor_1 = require("./sessions.processor");
const prisma_module_1 = require("../../database/prisma/prisma.module");
const tasks_module_1 = require("../tasks/tasks.module");
const integrations_module_1 = require("../../integrations/integrations.module");
const assessment_module_1 = require("../assessment/assessment.module");
let SessionsModule = class SessionsModule {
};
exports.SessionsModule = SessionsModule;
exports.SessionsModule = SessionsModule = __decorate([
    (0, common_1.Module)({
        imports: [
            prisma_module_1.PrismaModule,
            tasks_module_1.TasksModule,
            integrations_module_1.IntegrationsModule,
            (0, common_1.forwardRef)(() => assessment_module_1.AssessmentModule),
            bull_1.BullModule.registerQueue({
                name: 'sessions',
            }),
        ],
        controllers: [sessions_controller_1.SessionsController],
        providers: [sessions_service_1.SessionsService, sessions_processor_1.SessionsProcessor],
        exports: [sessions_service_1.SessionsService],
    })
], SessionsModule);
//# sourceMappingURL=sessions.module.js.map