import { PrismaService } from '../../database/prisma/prisma.service';
export declare class FriendshipService {
    private prisma;
    constructor(prisma: PrismaService);
    sendRequest(requesterId: string, addresseeClerkIdOrEmail: string): Promise<{
        id: string;
        createdAt: Date;
        status: string;
        senderId: string;
        receiverId: string;
    }>;
    sendRequestById(requesterId: string, addresseeId: string): Promise<{
        id: string;
        createdAt: Date;
        status: string;
        senderId: string;
        receiverId: string;
    }>;
    acceptRequest(userId: string, requestId: string): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        status: string;
        requesterId: string;
        addresseeId: string;
    }>;
    rejectRequest(userId: string, requestId: string): Promise<{
        id: string;
        createdAt: Date;
        status: string;
        senderId: string;
        receiverId: string;
    }>;
    getFriends(userId: string): Promise<({
        requester: {
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
        addressee: {
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
    } & {
        id: string;
        createdAt: Date;
        updatedAt: Date;
        status: string;
        requesterId: string;
        addresseeId: string;
    })[]>;
    getPendingRequests(userId: string): Promise<({
        sender: {
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
    } & {
        id: string;
        createdAt: Date;
        status: string;
        senderId: string;
        receiverId: string;
    })[]>;
    areFriends(userAId: string, userBId: string): Promise<boolean>;
}
