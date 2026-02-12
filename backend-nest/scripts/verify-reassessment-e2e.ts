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

async function runFullAssessment(userId: string, label: string) {
    console.log(`\n🏃 Running Assessment: ${label}`);
    const startRes = await axios.post(`${API_URL}/assessment/start`, { userId });
    const assessmentId = startRes.data.id;

    // Phase 1
    const p1Audio = await generateAudio("Today was a great day, I visited the park.", `p1_${label}`);
    const p1Res = await axios.post(`${API_URL}/assessment/submit`, { assessmentId, phase: "PHASE_1", audioBase64: p1Audio });

    // Phase 2 - Attempt 1
    const p2a1Audio = await generateAudio(p1Res.data.nextSentence.text, `p2a1_${label}`);
    const p2a1Res = await axios.post(`${API_URL}/assessment/submit`, { assessmentId, phase: "PHASE_2", attempt: 1, audioBase64: p2a1Audio });

    // Phase 2 - Attempt 2
    const p2a2Audio = await generateAudio(p2a1Res.data.nextSentence.text, `p2a2_${label}`);
    const p2a2Res = await axios.post(`${API_URL}/assessment/submit`, { assessmentId, phase: "PHASE_2", attempt: 2, audioBase64: p2a2Audio });

    // Phase 3
    const p3Audio = await generateAudio("I see a busy park with many people.", `p3_${label}`);
    await axios.post(`${API_URL}/assessment/submit`, { assessmentId, phase: "PHASE_3", audioBase64: p3Audio });

    // Phase 4
    const p4Audio = await generateAudio("My biggest challenge is grammar.", `p4_${label}`);
    const finalRes = await axios.post(`${API_URL}/assessment/submit`, { assessmentId, phase: "PHASE_4", audioBase64: p4Audio });

    return finalRes.data;
}

async function main() {
    console.log("🚀 Starting Phase 2 E2E Verification (Reassessment + Progress Map)...");

    const userId = 'test_reassessment_user';
    await prisma.user.upsert({
        where: { clerkId: userId },
        update: { overallLevel: null },
        create: { id: userId, clerkId: userId, fname: 'Re', lname: 'Tester', nativeLang: 'French', level: 'A1' }
    });

    // 1. First Assessment
    const result1 = await runFullAssessment(userId, "FIRST");
    console.log(`✅ First Assessment Completed. Level: ${result1.overallLevel}, Score: ${result1.overallScore}`);

    // 2. Immediate Reassessment (Should Fail)
    console.log("\n🛑 Testing 7-day rule (immediate retry)...");
    try {
        await axios.post(`${API_URL}/assessment/start`, { userId });
        throw new Error("❌ Should have blocked reassessment!");
    } catch (e: any) {
        if (e.response?.status === 403) {
            console.log("✅ Correctly blocked: " + e.response.data.message);
            console.log("   Next available at: " + e.response.data.nextAvailableAt);
        } else {
            throw e;
        }
    }

    // 3. Mock 8 days passed
    console.log("\n⏳ Mocking 8 days pass...");
    const eightDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
    await prisma.assessmentSession.update({
        where: { id: result1.assessmentId },
        data: { completedAt: eightDaysAgo }
    });

    // 4. Second Assessment
    const result2 = await runFullAssessment(userId, "SECOND");
    console.log(`✅ Second Assessment Completed. Level: ${result2.overallLevel}, Score: ${result2.overallScore}`);

    // 5. Verify Improvement Delta
    if (result2.improvementDelta) {
        console.log(`✅ Improvement Delta detected: ${JSON.stringify(result2.improvementDelta)}`);
    } else {
        throw new Error("❌ Improvement delta missing!");
    }

    // 6. Verify Dashboard
    console.log("\n📊 Checking Dashboard Endpoint...");
    const dashRes = await axios.get(`${API_URL}/assessment/dashboard`, { params: { userId } });
    const dash = dashRes.data;

    if (dash.state === 'DASHBOARD' && dash.overallScore === result2.overallScore) {
        console.log("✅ Dashboard data matches latest assessment.");
        console.log(`   Weakness Map count: ${dash.weaknessMap.length}`);
        console.log(`   Personalized Plan goal: ${dash.personalizedPlan.weeklyGoal}`);
    } else {
        throw new Error("❌ Dashboard verification failed!");
    }

    console.log("\n🎉 Phase 2 E2E Verification Passed Successfully!");
}

main().catch(e => {
    console.error("\n❌ Phase 2 E2E Failed:", e.response?.data || e.message);
    process.exit(1);
}).finally(async () => {
    await prisma.$disconnect();
});
