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
exports.RedisService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const ioredis_1 = require("ioredis");
let RedisService = class RedisService {
    constructor(configService) {
        this.configService = configService;
    }
    async onModuleInit() {
        this.client = new ioredis_1.default({
            host: this.configService.get('REDIS_HOST', 'localhost'),
            port: this.configService.get('REDIS_PORT', 6379),
            password: this.configService.get('REDIS_PASSWORD'),
            db: 0,
            retryStrategy: (times) => {
                const delay = Math.min(times * 50, 2000);
                return delay;
            },
        });
        this.client.on('error', (error) => {
            console.error('Redis connection error:', error);
        });
        this.client.on('connect', () => {
            console.log('Redis connected successfully');
        });
        try {
            await this.client.ping();
            console.log('Redis connection verified');
        }
        catch (error) {
            console.error('Redis connection failed:', error);
        }
    }
    async onModuleDestroy() {
        if (this.client) {
            await this.client.quit();
        }
    }
    getClient() {
        return this.client;
    }
    async set(key, value, expireInSeconds) {
        if (expireInSeconds) {
            await this.client.setex(key, expireInSeconds, value);
        }
        else {
            await this.client.set(key, value);
        }
    }
    async get(key) {
        return await this.client.get(key);
    }
    async del(key) {
        return await this.client.del(key);
    }
    async exists(key) {
        return await this.client.exists(key);
    }
    async expire(key, seconds) {
        return await this.client.expire(key, seconds);
    }
    async hset(key, field, value) {
        return await this.client.hset(key, field, value);
    }
    async hget(key, field) {
        return await this.client.hget(key, field);
    }
    async hgetall(key) {
        return await this.client.hgetall(key);
    }
    async hdel(key, ...fields) {
        return await this.client.hdel(key, ...fields);
    }
    async lpush(key, ...values) {
        return await this.client.lpush(key, ...values);
    }
    async rpush(key, ...values) {
        return await this.client.rpush(key, ...values);
    }
    async lrange(key, start, stop) {
        return await this.client.lrange(key, start, stop);
    }
    async llen(key) {
        return await this.client.llen(key);
    }
    async sadd(key, ...members) {
        return await this.client.sadd(key, ...members);
    }
    async smembers(key) {
        return await this.client.smembers(key);
    }
    async sismember(key, member) {
        return await this.client.sismember(key, member);
    }
    async zadd(key, score, member) {
        return await this.client.zadd(key, score, member);
    }
    async zrange(key, start, stop) {
        return await this.client.zrange(key, start, stop);
    }
    async zrevrange(key, start, stop) {
        return await this.client.zrevrange(key, start, stop);
    }
    async zcard(key) {
        return await this.client.zcard(key);
    }
};
exports.RedisService = RedisService;
exports.RedisService = RedisService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService])
], RedisService);
//# sourceMappingURL=redis.service.js.map