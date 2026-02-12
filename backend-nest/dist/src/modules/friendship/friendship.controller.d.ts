import { FriendshipService } from './friendship.service';
export declare class FriendshipController {
    private readonly friendshipService;
    constructor(friendshipService: FriendshipService);
    sendRequest(body: {
        requesterId: string;
        addresseeClerkIdOrEmail: string;
    }): Promise<{
        id: string;
        createdAt: Date;
        status: string;
        senderId: string;
        receiverId: string;
    }>;
    acceptRequest(id: string, body: {
        userId: string;
    }): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        status: string;
        requesterId: string;
        addresseeId: string;
    }>;
    rejectRequest(id: string, body: {
        userId: string;
    }): Promise<{
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
}
