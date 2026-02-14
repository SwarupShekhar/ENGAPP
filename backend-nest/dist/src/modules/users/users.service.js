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
var UsersService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.UsersService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../database/prisma/prisma.service");
let UsersService = UsersService_1 = class UsersService {
    constructor(prisma) {
        this.prisma = prisma;
        this.logger = new common_1.Logger(UsersService_1.name);
    }
    async getUserStats(userId) {
        const user = await this.prisma.user.findUnique({
            where: { id: userId },
            include: {
                assessments: {
                    orderBy: { createdAt: 'desc' },
                    take: 1
                }
            }
        });
        if (!user)
            throw new common_1.NotFoundException('User not found');
        const latestAssessment = user.assessments[0];
        let feedbackScore = 0;
        let fluencyScore = 0;
        let vocabScore = 0;
        let grammarScore = 0;
        let pronScore = 0;
        if (latestAssessment) {
            const p2 = latestAssessment.phase2Data || {};
            const p3 = latestAssessment.phase3Data || {};
            fluencyScore = Math.round(p2.finalFluencyScore || 0);
            pronScore = Math.round(p2.finalPronunciationScore || 0);
            vocabScore = this.mapCEFRToScore(p3.vocabularyCEFR || 'A1');
            grammarScore = Math.round(p3.grammarScore || 0);
            feedbackScore = Math.round((fluencyScore + pronScore + vocabScore + grammarScore) / 4);
        }
        const streak = await this.calculateStreak(userId);
        const oneWeekAgo = new Date();
        oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
        const sessionsThisWeek = await this.prisma.assessmentSession.count({
            where: {
                userId,
                createdAt: { gte: oneWeekAgo }
            }
        });
        return {
            level: user.level || 'A1',
            nextLevel: this.getNextLevel(user.level || 'A1'),
            feedbackScore,
            fluencyScore,
            vocabScore,
            grammarScore,
            pronunciationScore: pronScore,
            streak,
            sessionsThisWeek,
            sessionGoal: 7,
            totalSessions: await this.prisma.assessmentSession.count({ where: { userId } }),
            mistakeCount: 5,
        };
    }
    async getUserHistory(userId) {
        const history = await this.prisma.assessmentSession.findMany({
            where: { userId },
            orderBy: { createdAt: 'desc' },
            take: 20
        });
        return history.map(session => {
            const p2 = session.phase2Data || {};
            const p3 = session.phase3Data || {};
            const score = Math.round(((p2.finalFluencyScore || 0) +
                (p2.finalPronunciationScore || 0) +
                (p3.grammarScore || 0) +
                (this.mapCEFRToScore(p3.vocabularyCEFR || 'A1'))) / 4);
            return {
                id: session.id,
                date: session.createdAt,
                duration: 600,
                overallScore: score || session.overallScore || 0,
                cefrLevel: session.overallLevel || 'A1',
                partnerName: 'AI Evaluator',
                topic: 'Assessment',
                status: session.status
            };
        });
    }
    mapCEFRToScore(cefr) {
        const map = { A1: 20, A2: 40, B1: 60, B2: 80, C1: 90, C2: 100 };
        return map[cefr] || 20;
    }
    getNextLevel(current) {
        const levels = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
        const idx = levels.indexOf(current);
        return levels[idx + 1] || 'C2';
    }
    async calculateStreak(userId) {
        const sessions = await this.prisma.assessmentSession.findMany({
            where: { userId },
            select: { createdAt: true },
            orderBy: { createdAt: 'desc' }
        });
        if (sessions.length === 0)
            return 0;
        const dates = [...new Set(sessions.map(s => s.createdAt.toISOString().split('T')[0]))];
        if (dates.length === 0)
            return 0;
        const today = new Date();
        const todayStr = today.toISOString().split('T')[0];
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayStr = yesterday.toISOString().split('T')[0];
        if (dates[0] !== todayStr && dates[0] !== yesterdayStr) {
            return 0;
        }
        let streak = 1;
        let currentDate = new Date(dates[0]);
        for (let i = 1; i < dates.length; i++) {
            const previousDate = new Date(currentDate);
            previousDate.setDate(previousDate.getDate() - 1);
            const previousDateStr = previousDate.toISOString().split('T')[0];
            if (dates[i] === previousDateStr) {
                streak++;
                currentDate = previousDate;
            }
            else {
                break;
            }
        }
        return streak;
    }
};
exports.UsersService = UsersService;
exports.UsersService = UsersService = UsersService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], UsersService);
//# sourceMappingURL=users.service.js.map