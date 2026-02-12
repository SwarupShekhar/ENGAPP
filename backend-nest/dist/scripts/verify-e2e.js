"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const socket_io_client_1 = require("socket.io-client");
const axios_1 = require("axios");
const dotenv = require("dotenv");
const pg_1 = require("pg");
const adapter_pg_1 = require("@prisma/adapter-pg");
dotenv.config();
const connectionString = process.env.DATABASE_URL;
const pool = new pg_1.Pool({ connectionString });
const adapter = new adapter_pg_1.PrismaPg(pool);
const prisma = new client_1.PrismaClient({ adapter });
const BASE_URL = 'http://localhost:3002';
const WS_URL = 'http://localhost:3002';
async function main() {
    console.log('🚀 Starting End-to-End Verification...');
    console.log('🌱 Seeding Users...');
    const userA = await upsertUser('user_a', 'User', 'A', 'en', 'B1');
    const userB = await upsertUser('user_b', 'User', 'B', 'es', 'A2');
    await prisma.friendship.deleteMany({});
    await prisma.friendRequest.deleteMany({});
    await prisma.chatMessage.deleteMany({});
    console.log('✅ Users seeded and clean state ensured.');
    console.log('💌 User A sending friend request to User B...');
    try {
        await axios_1.default.post(`${BASE_URL}/friendship/request`, {
            requesterId: userA.id,
            addresseeClerkIdOrEmail: userB.clerkId
        });
        console.log('✅ Friend Request Sent.');
    }
    catch (e) {
        console.error('❌ Failed to send friend request:', e.response?.data || e.message);
        process.exit(1);
    }
    console.log('🔍 User B checking pending requests...');
    let requestId = '';
    try {
        const res = await axios_1.default.get(`${BASE_URL}/friendship/${userB.id}/pending`);
        const requests = res.data;
        if (requests.length === 0)
            throw new Error('No pending requests found');
        requestId = requests[0].id;
        console.log(`✅ Found pending request: ${requestId}`);
    }
    catch (e) {
        console.error('❌ Failed to get pending requests:', e.response?.data || e.message);
        process.exit(1);
    }
    console.log('🤝 User B accepting friend request...');
    try {
        await axios_1.default.patch(`${BASE_URL}/friendship/${requestId}/accept`, {
            userId: userB.id
        });
        console.log('✅ Friend Request Accepted.');
    }
    catch (e) {
        console.error('❌ Failed to accept friend request:', e.response?.data || e.message);
        process.exit(1);
    }
    const friendships = await prisma.friendship.findMany({});
    console.log('🔍 Current Friendships in DB:', JSON.stringify(friendships, null, 2));
    console.log('💬 Testing Chat Flow...');
    const socketA = (0, socket_io_client_1.io)(WS_URL, {
        auth: { token: 'TEST_TOKEN_a' },
        transports: ['websocket']
    });
    const socketB = (0, socket_io_client_1.io)(WS_URL, {
        auth: { token: 'TEST_TOKEN_b' },
        transports: ['websocket']
    });
    const chatPromise = new Promise((resolve, reject) => {
        let aConnected = false;
        let bConnected = false;
        socketA.on('connect', () => {
            console.log('✅ User A connected to Socket');
            aConnected = true;
            if (bConnected)
                sendMsg();
        });
        socketB.on('connect', () => {
            console.log('✅ User B connected to Socket');
            bConnected = true;
            if (aConnected)
                sendMsg();
        });
        socketB.on('chat:receive', (data) => {
            console.log('📩 User B received message:', data);
            if (data.from === 'user_a' && data.message === 'Hello User B!') {
                console.log('✅ Message content verified.');
                resolve();
            }
            else {
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
                toUserId: 'user_b',
                message: 'Hello User B!'
            });
        }
        setTimeout(() => reject(new Error('Timeout waiting for message')), 5000);
    });
    try {
        await chatPromise;
        console.log('✅ Chat Verification Successful!');
    }
    catch (e) {
        console.error('❌ Chat Verification Failed:', e);
        process.exit(1);
    }
    finally {
        socketA.disconnect();
        socketB.disconnect();
        await prisma.$disconnect();
    }
    console.log('🎉 All E2E Tests Passed.');
}
async function upsertUser(id, fname, lname, nativeLang, level) {
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
//# sourceMappingURL=verify-e2e.js.map