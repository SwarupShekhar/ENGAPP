import { HttpStatus } from '@nestjs/common';
import { AuthService } from './auth.service';
export declare class AuthController {
    private readonly authService;
    private readonly logger;
    constructor(authService: AuthService);
    getProfile(req: any): Promise<{
        statusCode: HttpStatus;
        message: string;
        data: {
            profile: {
                id: string;
                userId: string;
                bio: string | null;
                avatarUrl: string | null;
                streak: number;
                totalSessions: number;
            };
        } & {
            level: string;
            id: string;
            clerkId: string;
            fname: string;
            lname: string;
            gender: string | null;
            hobbies: string[];
            nativeLang: string;
            overallLevel: string | null;
            talkStyle: import(".prisma/client").$Enums.TalkStyle | null;
            levelUpdatedAt: Date | null;
            createdAt: Date;
            updatedAt: Date;
        };
        error?: undefined;
    } | {
        statusCode: HttpStatus;
        message: string;
        error: any;
        data?: undefined;
    }>;
    getCurrentUser(req: any): Promise<{
        statusCode: HttpStatus;
        message: string;
        data: {
            profile: {
                id: string;
                userId: string;
                bio: string | null;
                avatarUrl: string | null;
                streak: number;
                totalSessions: number;
            };
        } & {
            level: string;
            id: string;
            clerkId: string;
            fname: string;
            lname: string;
            gender: string | null;
            hobbies: string[];
            nativeLang: string;
            overallLevel: string | null;
            talkStyle: import(".prisma/client").$Enums.TalkStyle | null;
            levelUpdatedAt: Date | null;
            createdAt: Date;
            updatedAt: Date;
        };
        error?: undefined;
    } | {
        statusCode: HttpStatus;
        message: string;
        error: any;
        data?: undefined;
    }>;
    registerUser(userData: any): Promise<{
        statusCode: HttpStatus;
        message: string;
        data: {
            profile: {
                id: string;
                userId: string;
                bio: string | null;
                avatarUrl: string | null;
                streak: number;
                totalSessions: number;
            };
        } & {
            level: string;
            id: string;
            clerkId: string;
            fname: string;
            lname: string;
            gender: string | null;
            hobbies: string[];
            nativeLang: string;
            overallLevel: string | null;
            talkStyle: import(".prisma/client").$Enums.TalkStyle | null;
            levelUpdatedAt: Date | null;
            createdAt: Date;
            updatedAt: Date;
        };
        error?: undefined;
    } | {
        statusCode: HttpStatus;
        message: string;
        error: any;
        data?: undefined;
    }>;
    clerkWebhook(body: any): Promise<{
        status: string;
        message?: undefined;
    } | {
        status: string;
        message: any;
    }>;
    healthCheck(): Promise<{
        statusCode: HttpStatus;
        message: string;
        timestamp: string;
    }>;
}
