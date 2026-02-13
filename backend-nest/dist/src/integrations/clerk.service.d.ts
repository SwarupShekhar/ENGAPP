import { ConfigService } from '@nestjs/config';
export declare class ClerkService {
    private configService;
    private readonly logger;
    constructor(configService: ConfigService);
    verifyToken(token: string): Promise<any | null>;
    getUser(userId: string): Promise<{
        id: string;
        emailAddresses: import("@clerk/clerk-sdk-node").EmailAddress[];
        firstName: string;
        lastName: string;
    }>;
    createUser(userData: {
        emailAddress: string[];
        password?: string;
        firstName?: string;
        lastName?: string;
    }): Promise<{
        emailAddress: string[];
        password?: string;
        firstName?: string;
        lastName?: string;
        id: string;
    }>;
}
