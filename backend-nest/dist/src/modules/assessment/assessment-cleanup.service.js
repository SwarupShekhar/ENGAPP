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
var AssessmentCleanupService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.AssessmentCleanupService = void 0;
const common_1 = require("@nestjs/common");
const schedule_1 = require("@nestjs/schedule");
const prisma_service_1 = require("../../database/prisma/prisma.service");
let AssessmentCleanupService = AssessmentCleanupService_1 = class AssessmentCleanupService {
    constructor(prisma) {
        this.prisma = prisma;
        this.logger = new common_1.Logger(AssessmentCleanupService_1.name);
    }
    async handleAbandonedAssessments() {
        this.logger.debug('Checking for abandoned assessments...');
        const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
        const count = await this.prisma.assessmentSession.updateMany({
            where: {
                status: 'IN_PROGRESS',
                createdAt: {
                    lt: tenMinutesAgo,
                },
            },
            data: {
                status: 'ABANDONED',
            },
        });
        if (count.count > 0) {
            this.logger.log(`Marked ${count.count} assessments as ABANDONED`);
        }
    }
};
exports.AssessmentCleanupService = AssessmentCleanupService;
__decorate([
    (0, schedule_1.Cron)(schedule_1.CronExpression.EVERY_MINUTE),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], AssessmentCleanupService.prototype, "handleAbandonedAssessments", null);
exports.AssessmentCleanupService = AssessmentCleanupService = AssessmentCleanupService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], AssessmentCleanupService);
//# sourceMappingURL=assessment-cleanup.service.js.map