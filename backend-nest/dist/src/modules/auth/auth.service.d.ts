import { DatabaseService } from '../../database/postgres/database.service';
import { ClerkService } from '../../integrations/clerk.service';
export declare class AuthService {
    private database;
    private clerkService;
    constructor(database: DatabaseService, clerkService: ClerkService);
    validateUser(clerkId: string): Promise<any>;
    getUserProfile(userId: string): Promise<any>;
    createUser(userData: {
        clerkId: string;
        fname: string;
        lname: string;
        gender?: string;
        hobbies?: string[];
        nativeLang: string;
        level: string;
    }): Promise<any>;
}
