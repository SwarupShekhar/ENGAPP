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
Object.defineProperty(exports, "__esModule", { value: true });
exports.DatabaseService = void 0;
const common_1 = require("@nestjs/common");
const pg_1 = require("pg");
const config_1 = require("@nestjs/config");
let DatabaseService = class DatabaseService {
    constructor(configService) {
        this.configService = configService;
        const config = {
            host: 'localhost',
            port: 5432,
            database: 'engr_app',
            user: 'postgres',
            password: '171199',
            max: 20,
            idleTimeoutMillis: 30000,
            connectionTimeoutMillis: 2000,
        };
        this.pool = new pg_1.Pool(config);
    }
    async onModuleInit() {
        try {
            const client = await this.pool.connect();
            await client.query('SELECT NOW()');
            console.log('Successfully connected to PostgreSQL database');
            client.release();
        }
        catch (error) {
            console.error('Failed to connect to PostgreSQL database:', error);
            throw error;
        }
    }
    async onModuleDestroy() {
        await this.pool.end();
    }
    getPool() {
        return this.pool;
    }
    async query(text, params) {
        return await this.pool.query(text, params);
    }
};
exports.DatabaseService = DatabaseService;
exports.DatabaseService = DatabaseService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService])
], DatabaseService);
//# sourceMappingURL=database.service.js.map