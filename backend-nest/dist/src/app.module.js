"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppModule = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const bull_1 = require("@nestjs/bull");
const schedule_1 = require("@nestjs/schedule");
const app_controller_1 = require("./app.controller");
const app_service_1 = require("./app.service");
const auth_module_1 = require("./modules/auth/auth.module");
const redis_module_1 = require("./redis/redis.module");
const matchmaking_module_1 = require("./modules/matchmaking/matchmaking.module");
const livekit_module_1 = require("./modules/livekit/livekit.module");
const sessions_module_1 = require("./modules/sessions/sessions.module");
const tasks_module_1 = require("./modules/tasks/tasks.module");
const feedback_module_1 = require("./modules/feedback/feedback.module");
const integrations_module_1 = require("./integrations/integrations.module");
const assessment_module_1 = require("./modules/assessment/assessment.module");
const friendship_module_1 = require("./modules/friendship/friendship.module");
const chat_module_1 = require("./modules/chat/chat.module");
const app_config_1 = require("./config/app.config");
const database_config_1 = require("./config/database.config");
const redis_config_1 = require("./config/redis.config");
const livekit_config_1 = require("./config/livekit.config");
let AppModule = class AppModule {
};
exports.AppModule = AppModule;
exports.AppModule = AppModule = __decorate([
    (0, common_1.Module)({
        imports: [
            schedule_1.ScheduleModule.forRoot(),
            config_1.ConfigModule.forRoot({
                isGlobal: true,
                load: [app_config_1.default, database_config_1.default, redis_config_1.default, livekit_config_1.default],
                envFilePath: ['.env', '.env.local'],
            }),
            bull_1.BullModule.forRootAsync({
                imports: [config_1.ConfigModule],
                useFactory: async (configService) => ({
                    redis: {
                        host: configService.get('redis.host') || 'localhost',
                        port: configService.get('redis.port') || 6379,
                        password: configService.get('redis.password'),
                    },
                }),
                inject: [config_1.ConfigService],
            }),
            redis_module_1.RedisModule,
            auth_module_1.AuthModule,
            matchmaking_module_1.MatchmakingModule,
            livekit_module_1.LivekitModule,
            sessions_module_1.SessionsModule,
            tasks_module_1.TasksModule,
            feedback_module_1.FeedbackModule,
            integrations_module_1.IntegrationsModule,
            assessment_module_1.AssessmentModule,
            friendship_module_1.FriendshipModule,
            chat_module_1.ChatModule,
        ],
        controllers: [app_controller_1.AppController],
        providers: [app_service_1.AppService],
    })
], AppModule);
//# sourceMappingURL=app.module.js.map