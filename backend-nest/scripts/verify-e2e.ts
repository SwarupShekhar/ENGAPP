
import { PrismaClient } from '@prisma/client';
import { io } from 'socket.io-client';
import axios from 'axios';
import * as dotenv from 'dotenv';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';

dotenv.config();

const connectionString = process.env.DATABASE_URL;
const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const BASE_URL = 'http://localhost:3002'; // Verify port
const WS_URL = 'http://localhost:3002';

async function main() {
    console.log('🚀 Starting End-to-End Verification...');

    // 1. Seed Users
    console.log('🌱 Seeding Users...');
    const userA = await upsertUser('user_a', 'User', 'A', 'en', 'B1');
    const userB = await upsertUser('user_b', 'User', 'B', 'es', 'A2');

    // Clear existing friendships/requests to start fresh
    await prisma.friendship.deleteMany({});
    await prisma.friendRequest.deleteMany({});
    await prisma.chatMessage.deleteMany({});
    console.log('✅ Users seeded and clean state ensured.');

    // 2. HTTP: Send Friend Request (A -> B)
    console.log('💌 User A sending friend request to User B...');
    try {
        await axios.post(`${BASE_URL}/friendship/request`, {
            requesterId: userA.id,
            addresseeClerkIdOrEmail: userB.clerkId
        });
        console.log('✅ Friend Request Sent.');
    } catch (e: any) {
        console.error('❌ Failed to send friend request:', e.response?.data || e.message);
        process.exit(1);
    }

    // 3. HTTP: Check Pending Requests for B
    console.log('🔍 User B checking pending requests...');
    let requestId = '';
    try {
        const res = await axios.get(`${BASE_URL}/friendship/${userB.id}/pending`);
        const requests = res.data;
        if (requests.length === 0) throw new Error('No pending requests found');
        requestId = requests[0].id;
        console.log(`✅ Found pending request: ${requestId}`);
    } catch (e: any) {
        console.error('❌ Failed to get pending requests:', e.response?.data || e.message);
        process.exit(1);
    }

    // 4. HTTP: Accept Friend Request (B)
    console.log('🤝 User B accepting friend request...');
    try {
        await axios.patch(`${BASE_URL}/friendship/${requestId}/accept`, {
            userId: userB.id
        });
        console.log('✅ Friend Request Accepted.');
    } catch (e: any) {
        console.error('❌ Failed to accept friend request:', e.response?.data || e.message);
        process.exit(1);
    }

    // Verify Friendship in DB
    const friendships = await prisma.friendship.findMany({});
    console.log('🔍 Current Friendships in DB:', JSON.stringify(friendships, null, 2));

    // 5. WebSocket: Chat Flow
    console.log('💬 Testing Chat Flow...');

    const socketA = io(WS_URL, {
        auth: { token: 'TEST_TOKEN_a' }, // Generates 'user_a'
        transports: ['websocket']
    });

    const socketB = io(WS_URL, {
        auth: { token: 'TEST_TOKEN_b' }, // Generates 'user_b'
        transports: ['websocket']
    });

    const chatPromise = new Promise<void>((resolve, reject) => {
        let aConnected = false;
        let bConnected = false;

        socketA.on('connect', () => {
            console.log('✅ User A connected to Socket');
            aConnected = true;
            if (bConnected) sendMsg();
        });

        socketB.on('connect', () => {
            console.log('✅ User B connected to Socket');
            bConnected = true;
            if (aConnected) sendMsg();
        });

        socketB.on('chat:receive', (data) => {
            console.log('📩 User B received message:', data);
            if (data.from === 'user_a' && data.message === 'Hello User B!') {
                console.log('✅ Message content verified.');
                resolve();
            } else {
                reject(new Error('Received incorrect message'));
            }
        });

        socketA.on('chat:error', (err) => {
            console.error('❌ User A received error:', err);
            reject(err);
        });

        function sendMsg() {
            console.log('📤 User A sending message...');
            socketA.emit('chat:send', {
                toUserId: 'user_b', // Using internal ID (which matches our seed)
                message: 'Hello User B!'
            });
        }

        setTimeout(() => reject(new Error('Timeout waiting for message')), 5000);
    });

    try {
        await chatPromise;
        console.log('✅ Chat Verification Successful!');
    } catch (e) {
        console.error('❌ Chat Verification Failed:', e);
        process.exit(1);
    } finally {
        socketA.disconnect();
        socketB.disconnect();
        await prisma.$disconnect();
    }

    console.log('🎉 All E2E Tests Passed.');
}

async function upsertUser(id: string, fname: string, lname: string, nativeLang: string, level: string) {
    return prisma.user.upsert({
        where: { clerkId: id },
        update: {},
        create: {
            id: id,
            clerkId: id,
            fname,
            lname,
            nativeLang,
            level,
            hobbies: []
        }
    });
}

main().catch(console.error);
