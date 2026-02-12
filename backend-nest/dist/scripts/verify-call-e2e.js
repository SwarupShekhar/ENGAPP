"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const socket_io_client_1 = require("socket.io-client");
const axios_1 = require("axios");
const client_1 = require("@prisma/client");
const dotenv = require("dotenv");
const fs = require("fs");
const child_process_1 = require("child_process");
const pg_1 = require("pg");
const adapter_pg_1 = require("@prisma/adapter-pg");
dotenv.config();
const connectionString = process.env.DATABASE_URL;
const pool = new pg_1.Pool({ connectionString });
const adapter = new adapter_pg_1.PrismaPg(pool);
const prisma = new client_1.PrismaClient({ adapter });
const API_URL = "http://localhost:3003";
const WS_URL = "http://localhost:3003/audio";
async function main() {
    console.log("🚀 Starting Call + AI Analysis E2E Verification...");
    console.log("🎤 Generating sample audio (simulating user speech)...");
    const audioPath = "test_audio.wav";
    try {
        (0, child_process_1.execSync)(`say "I goes to the store to buy apple." -o ${audioPath} --file-format=WAVE --data-format=LEI16@16000`);
    }
    catch (e) {
        console.warn("⚠️  'say' command failed (not on Mac?). Creating dummy wav file.");
        const buffer = Buffer.alloc(44 + 1000);
        buffer.write("RIFF", 0);
        buffer.writeUInt32LE(36 + 1000, 4);
        buffer.write("WAVE", 8);
        buffer.write("fmt ", 12);
        buffer.writeUInt32LE(16, 16);
        buffer.writeUInt16LE(1, 20);
        buffer.writeUInt16LE(1, 22);
        buffer.writeUInt32LE(16000, 24);
        buffer.writeUInt32LE(32000, 28);
        buffer.writeUInt16LE(2, 32);
        buffer.writeUInt16LE(16, 34);
        buffer.write("data", 36);
        buffer.writeUInt32LE(1000, 40);
        fs.writeFileSync(audioPath, buffer);
    }
    if (!fs.existsSync(audioPath)) {
        throw new Error("Failed to create audio file");
    }
    const audioBuffer = fs.readFileSync(audioPath);
    console.log(`✅ Audio prepared: ${audioBuffer.length} bytes`);
    const userA = await prisma.user.findFirst({ where: { clerkId: 'user_a' } });
    const userB = await prisma.user.findFirst({ where: { clerkId: 'user_b' } });
    if (!userA || !userB) {
        console.error("❌ Users not found. Run verify-e2e.ts first to seed users.");
        process.exit(1);
    }
    console.log(`🚀 Starting Session for ${userA.id} and ${userB.id}...`);
    const startRes = await axios_1.default.post(`${API_URL}/sessions/start`, {
        matchId: "mock_match_" + Date.now(),
        participants: [userA.id, userB.id],
        topic: "E2E Call Verification",
        estimatedDuration: 300
    }).catch(e => {
        console.error("❌ Failed to start session:", e.response?.data || e.message);
        process.exit(1);
    });
    const sessionId = startRes.data.id;
    console.log(`✅ Session Started: ${sessionId}`);
    console.log("🔌 Connecting User A to Audio Gateway...");
    const socketA = (0, socket_io_client_1.io)(WS_URL, {
        auth: { token: "TEST_TOKEN_a" },
        transports: ["websocket"]
    });
    await new Promise((resolve, reject) => {
        socketA.on("connect", () => {
            console.log("✅ User A Connected to Audio Namespace");
            resolve();
        });
        socketA.on("connect_error", (err) => {
            console.error("❌ Connection failed:", err.message);
            reject(err);
        });
    });
    console.log("🎙️  User A Streaming Audio to Azure...");
    socketA.emit("startStream", { userId: userA.id, sessionId });
    const chunkSize = 4096;
    let offset = 0;
    const durationMs = 15000;
    const intervalMs = 100;
    let sentBytes = 0;
    const streamInterval = setInterval(() => {
        if (offset >= audioBuffer.length) {
            offset = 0;
        }
        const end = Math.min(offset + chunkSize, audioBuffer.length);
        const chunk = audioBuffer.subarray(offset, end);
        socketA.emit("audioData", chunk);
        sentBytes += chunk.length;
        offset += chunkSize;
    }, intervalMs);
    socketA.on("transcription", (data) => {
        console.log("   📝 Real-time transcript:", data.text);
    });
    await new Promise(r => setTimeout(r, durationMs));
    clearInterval(streamInterval);
    console.log(`✅ Streamed ${sentBytes} bytes.`);
    console.log("🛑 Stopping Stream (Uploading to Azure Blob)...");
    const stopResult = await new Promise((resolve, reject) => {
        socketA.emit("stopStream", {}, (response) => {
            if (response && response.status === 'stopped') {
                resolve(response);
            }
            else {
                reject(new Error("Stop stream failed: " + JSON.stringify(response)));
            }
        });
        setTimeout(() => reject(new Error("Stop stream timed out")), 10000);
    });
    const audioUrl = stopResult.url;
    console.log(`✅ Azure Blob URL received: ${audioUrl}`);
    socketA.disconnect();
    console.log("🏁 Ending Session (Triggering Analysis)...");
    const endRes = await axios_1.default.post(`${API_URL}/sessions/${sessionId}/end`, {
        actualDuration: 15,
        userEndedEarly: false,
        audioUrls: {
            [userA.id]: audioUrl
        }
    }).catch(e => {
        console.error("❌ Failed to end session:", e.response?.data || e.message);
        process.exit(1);
    });
    console.log(`✅ Session Ended. Status: ${endRes.data.status}`);
    console.log("⏳ Waiting for SessionsProcessor to complete analysis...");
    let analysisComplete = false;
    for (let i = 0; i < 45; i++) {
        process.stdout.write(".");
        const session = await prisma.conversationSession.findUnique({ where: { id: sessionId } });
        if (session?.status === 'COMPLETED') {
            console.log("\n✅ Session Status is COMPLETED.");
            analysisComplete = true;
            break;
        }
        if (session?.status === 'ANALYSIS_FAILED') {
            console.error("\n❌ Session Analysis Failed (DB status).");
            throw new Error("Session Analysis Failed");
        }
        await new Promise(r => setTimeout(r, 2000));
    }
    if (!analysisComplete) {
        console.error("\n❌ Timeout waiting for analysis.");
        throw new Error("Timeout waiting for analysis");
    }
    console.log("🔍 Verifying Feedback & Analysis...");
    const feedbackRes = await axios_1.default.get(`${API_URL}/feedback/${sessionId}`, {
        headers: { Authorization: "Bearer TEST_TOKEN_a" }
    });
    const analysis = feedbackRes.data;
    console.log("📝 Final Transcript:", analysis.transcript.raw);
    console.log("💡 Feedback Details:", JSON.stringify(analysis.mistakes.items, null, 2));
    if (!analysis.transcript.raw) {
        throw new Error("❌ Transcript is empty!");
    }
    console.log("✅ Transcript generated.");
    if (analysis && analysis.mistakes) {
        if (analysis.mistakes.items && analysis.mistakes.items.length > 0) {
            console.log(`✅ Found ${analysis.mistakes.items.length} mistakes.`);
            const firstMistake = analysis.mistakes.items[0];
            console.log(`   Sample Mistake: "${firstMistake.original}" -> "${firstMistake.corrected}" (${firstMistake.explanation})`);
        }
        else {
            console.warn("⚠️  No mistakes found. Check if audio contained errors or if Gemini is too lenient.");
        }
    }
    else {
        throw new Error("❌ No feedback object returned.");
    }
    fs.unlinkSync(audioPath);
    console.log("\n🎉 Call + AI Analysis Pipeline Verified Successfully!");
}
main().catch(e => {
    console.error("\n❌ Verification Failed:", e);
    process.exit(1);
}).finally(async () => {
    await prisma.$disconnect();
});
//# sourceMappingURL=verify-call-e2e.js.map