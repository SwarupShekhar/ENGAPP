import axios from "axios";
import { PrismaClient } from "@prisma/client";
import * as dotenv from "dotenv";
import * as fs from "fs";
import { execSync } from "child_process";

dotenv.config();

const prisma = new PrismaClient();
const API_URL = "http://localhost:3002";

async function generateAudio(text: string, filename: string): Promise<string> {
    const path = `${filename}.wav`;
    try {
        execSync(`say "${text}" -o ${path} --file-format=WAVE --data-format=LEI16@16000`);
    } catch (e) {
        // Dummy WAV fallback
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
        fs.writeFileSync(path, buffer);
    }
    const audioBase64 = fs.readFileSync(path).toString('base64');
    fs.unlinkSync(path);
    return audioBase64;
}

async function main() {
    console.log("🚀 Starting Assessment E2E Verification...");

    // 1. Create Test User
    const testUser = await prisma.user.upsert({
        where: { clerkId: 'test_assessment_user' },
        update: {},
        create: {
            id: 'test_user_id',
            clerkId: 'test_assessment_user',
            fname: 'Test',
            lname: 'User',
            nativeLang: 'Spanish',
            level: 'A1'
        }
    });
    console.log(`✅ Test User Ready: ${testUser.id}`);

    // 2. Start Assessment
    const startRes = await axios.post(`${API_URL}/assessment/start`, { userId: testUser.id });
    const assessmentId = startRes.data.id;
    console.log(`✅ Assessment Started: ${assessmentId}`);

    // 3. Submit Phase 1
    console.log("🎤 Submitting Phase 1 (Warm-up)...");
    const p1Audio = await generateAudio("Today was a great day, I visited the park and spoke with some friends.", "p1");
    const p1Res = await axios.post(`${API_URL}/assessment/submit`, {
        assessmentId,
        phase: "PHASE_1",
        audioBase64: p1Audio
    });
    console.log(`✅ Phase 1 Submitted. Next sentence: ${p1Res.data.nextSentence.text}`);

    // 4. Submit Phase 2 - Attempt 1
    console.log("🎤 Submitting Phase 2 (Attempt 1)...");
    const p2a1Audio = await generateAudio(p1Res.data.nextSentence.text, "p2a1");
    const p2a1Res = await axios.post(`${API_URL}/assessment/submit`, {
        assessmentId,
        phase: "PHASE_2",
        attempt: 1,
        audioBase64: p2a1Audio
    });
    console.log(`✅ Phase 2 Attempt 1 Submitted. Next sentence: ${p2a1Res.data.nextSentence.text}`);

    // 5. Submit Phase 2 - Attempt 2
    console.log("🎤 Submitting Phase 2 (Attempt 2)...");
    const p2a2Audio = await generateAudio(p2a1Res.data.nextSentence.text, "p2a2");
    const p2a2Res = await axios.post(`${API_URL}/assessment/submit`, {
        assessmentId,
        phase: "PHASE_2",
        attempt: 2,
        audioBase64: p2a2Audio
    });
    console.log(`✅ Phase 2 Completed. Image Level: ${p2a2Res.data.imageLevel}`);

    // 6. Submit Phase 3
    console.log("🎤 Submitting Phase 3 (Image Description)...");
    const p3Audio = await generateAudio("In this picture I see a busy park with many people jogging and reading on benches.", "p3");
    const p3Res = await axios.post(`${API_URL}/assessment/submit`, {
        assessmentId,
        phase: "PHASE_3",
        audioBase64: p3Audio
    });
    console.log(`✅ Phase 3 Completed. Next Phase: ${p3Res.data.nextPhase}`);

    // 7. Submit Phase 4
    console.log("🎤 Submitting Phase 4 (Follow-up)...");
    const p4Audio = await generateAudio("My biggest challenge is pronouncing difficult words and understanding native speakers when they talk fast.", "p4");
    const finalRes = await axios.post(`${API_URL}/assessment/submit`, {
        assessmentId,
        phase: "PHASE_4",
        audioBase64: p4Audio
    });

    console.log("\n📊 Final Results:");
    console.log(JSON.stringify(finalRes.data, null, 2));

    // 8. Assertions
    if (finalRes.data.status !== 'COMPLETED') throw new Error("Status should be COMPLETED");
    if (!finalRes.data.overallLevel) throw new Error("Overall Level missing");
    if (!finalRes.data.talkStyle) throw new Error("Talk Style missing");
    if (finalRes.data.confidence < 0.6) throw new Error("Confidence too low");

    const updatedUser = await prisma.user.findUnique({ where: { id: testUser.id } });
    if (updatedUser?.overallLevel !== finalRes.data.overallLevel) throw new Error("User table not updated correctly");

    console.log("\n✅ Assessment E2E Passed");
}

main().catch(e => {
    console.error("\n❌ Assessment E2E Failed:", e.response?.data || e.message);
    process.exit(1);
}).finally(async () => {
    await prisma.$disconnect();
});
