import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { firstValueFrom } from 'rxjs';
import { PrismaService } from '../../database/prisma/prisma.service';
import * as FormData from 'form-data';

interface ConversationTurn {
  speaker: 'user' | 'ai';
  text: string;
  timestamp: Date;
  corrections?: any[];
}

interface ConversationSession {
  history: ConversationTurn[];
  pronunciationAttempts: {
    referenceText: string;
    accuracy: number;
    passed: boolean;
    timestamp: Date;
    problemWords: string[];
  }[];
}

const CONVERSATIONAL_TUTOR_PROMPT = `
You are Maya, a warm and witty English tutor for Indian learners. You grew up speaking Hindi and learned English yourself, so you genuinely understand the struggle — the fear of making mistakes, the confusion between similar words, the nervousness of speaking in front of others. That lived experience makes you patient, real, and encouraging without being fake.

You speak in Hinglish — a natural mix of English and Hindi — the way a friendly tutor would talk to you, not like a textbook.

---

WHO YOU ARE:
- Warm, a little playful, never condescending
- You celebrate small wins genuinely ("Arre wah! That was actually really good!")
- You tease gently when appropriate ("Yeh wali mistake toh classic hai, almost everyone makes it")
- You normalize mistakes — learning is messy and that's okay
- You have opinions and can go slightly off-script (talk about Bollywood, cricket, food) if the user brings it up, but you always loop back to English practice

---

HOW YOU TEACH:
- Correct ONE mistake at a time — the most important one. Ignore minor errors if the meaning was clear.
- When correcting, show the right form naturally in your reply rather than lecturing. E.g. if they said "I am go to market", you say "Oh nice, you went to the market! What did you get?" — correction is embedded, not highlighted.
- If the mistake is more serious and needs explicit attention, be quick and light: "Small thing — 'went', not 'go'. Okay, toh what happened next?"
- Ask follow-up questions that push them to speak MORE, not less.
- Vary your energy — sometimes you're excited, sometimes curious, sometimes gently teasing.

---

RESPONSE LENGTH & STYLE:
- STRICT LIMIT: 1-2 sentences maximum. Be concise.
- Natural conversation, not essays.
- If the user just needs encouragement, one line is enough.
- If they asked a real grammar question, you can go a little longer — but stay conversational, not lecture-y.
- End with a question or prompt often, to keep the conversation going.
- Use Hindi words/phrases naturally for warmth, not as a formula. Don't force it every single line.

---

THINGS TO AVOID:
- Never say "Great question!" or "Certainly!" — sounds robotic
- Never list bullet points or use headers in your response
- Never correct every single error in one message — that's overwhelming
- Never be sycophantic or excessively positive — it rings hollow
- Don't start every message the same way (avoid always opening with "Arre!" or always with the user's name)
- Never break character or mention that you're an AI
- NEVER use familial terms like "bhai", "didi", "brother", "sister", "bro". You are a tutor, not a sibling.
- NEVER use emojis (icons/symbols) in your response. Stay purely text-based.

---

ERROR CORRECTION FRAMEWORK:
When you detect an error, respond in this JSON format:
{
  "understood": "I understand you meant: [paraphrase in correct English]",
  "correction": {
    "wrong": "phrase they said",
    "right": "correct version",
    "explanation_hinglish": "brief reason in Hinglish",
    "severity": "major|minor"
  },
  "response": "your conversational response using Maya's witty/warm style",
  "follow_up": "a question to continue"
}

When there is NO error, respond in this JSON format:
{
  "response": "your conversational response",
  "follow_up": "a question to continue"
}

CONVERSATION HISTORY:
{conversation_history}

User just said: "{user_utterance}"
Respond naturally as Maya. Always use JSON format (no markdown blocks around json).
`;

@Injectable()
export class ConversationalTutorService {
  private readonly logger = new Logger(ConversationalTutorService.name);
  private genAI: GoogleGenerativeAI;
  private conversations: Map<string, ConversationSession> = new Map();
  private aiBackendUrl: string;

  constructor(
    private configService: ConfigService,
    private httpService: HttpService,
    private prisma: PrismaService,
  ) {
    this.genAI = new GoogleGenerativeAI(
      this.configService.get<string>('GOOGLE_API_KEY'),
    );
    this.aiBackendUrl =
      this.configService.get<string>('AI_BACKEND_URL') ||
      'http://localhost:8001';
  }

  // ─── Existing: Process user utterance with Gemini ──────────

  async processUserUtterance(
    sessionId: string,
    userUtterance: string,
    userId: string,
  ) {
    const session = this.getOrCreateSession(sessionId);

    // Build conversation history for context
    const historyStr = session.history
      .slice(-10) // last 10 turns
      .map((t) => `${t.speaker === 'user' ? 'User' : 'Maya'}: ${t.text}`)
      .join('\n');

    const model = this.genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
    const prompt = CONVERSATIONAL_TUTOR_PROMPT.replace(
      '{user_utterance}',
      userUtterance,
    ).replace(
      '{conversation_history}',
      historyStr || '(start of conversation)',
    );

    const result = await model.generateContent(prompt);
    const responseText = result.response.text();

    // Parse JSON from Gemini response
    let responseJson: any;
    try {
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      responseJson = jsonMatch
        ? JSON.parse(jsonMatch[0])
        : { response: responseText };
    } catch (e) {
      this.logger.error(`Failed to parse Gemini response: ${e.message}`);
      responseJson = { response: responseText };
    }

    // Store history
    session.history.push({
      speaker: 'user',
      text: userUtterance,
      timestamp: new Date(),
    });
    session.history.push({
      speaker: 'ai',
      text: responseJson.response || responseText,
      timestamp: new Date(),
      corrections: responseJson.correction ? [responseJson.correction] : [],
    });
    this.conversations.set(sessionId, session);

    return responseJson;
  }

  // ─── Existing: Transcribe Hinglish via AI Engine ───────────

  async transcribeHinglish(audioBuffer: Buffer, userId: string) {
    try {
      const audioBase64 = audioBuffer.toString('base64');
      const response = await firstValueFrom(
        this.httpService.post(`${this.aiBackendUrl}/api/tutor/stt`, {
          audio_base64: audioBase64,
          user_id: userId,
        }),
      );
      return response.data.data;
    } catch (error) {
      this.logger.error(
        `Generic STT failed: ${error.message} - URL: ${this.aiBackendUrl}/api/tutor/stt`,
      );
      if (error.response) {
        this.logger.error(
          `Upstream error data: ${JSON.stringify(error.response.data)}`,
        );
      }
      throw error;
    }
  }

  // ─── Existing: Synthesize Hinglish via AI Engine ───────────

  async synthesizeHinglish(text: string): Promise<string> {
    try {
      const response = await firstValueFrom(
        this.httpService.post(`${this.aiBackendUrl}/api/tutor/tts`, {
          text: text,
          gender: 'female',
        }),
      );
      return response.data.data.audio_base64;
    } catch (error) {
      this.logger.error(`TTS synthesis failed: ${error.message}`);
      return '';
    }
  }

  // ─── Existing: End session ─────────────────────────────────

  async startSession(userId: string) {
    // 1. Create session in DB + get user name in parallel
    const [dbSession, user] = await Promise.all([
      this.prisma.conversationSession.create({
        data: {
          structure: 'ai_tutor',
          status: 'IN_PROGRESS',
          participants: {
            create: [{ userId }],
          },
        },
        include: {
          participants: true,
        },
      }),
      this.prisma.user.findUnique({
        where: { id: userId },
        select: { fname: true },
      }),
    ]);

    const sessionId = dbSession.id;
    const name = user?.fname || 'Friend';
    const message = `Namaste ${name}! I'm Maya, your English tutor. Aaj hum English practice karenge — just hold the mic and speak!`;

    // 2. Initialize in-memory state immediately (no waiting for TTS)
    const session = {
      history: [
        {
          speaker: 'ai' as const,
          text: message,
          timestamp: new Date(),
        },
      ],
      pronunciationAttempts: [],
    };
    this.conversations.set(sessionId, session);

    // 3. Return immediately — NO TTS for greeting (saves 1-2s)
    //    The user reads the text. Audio will come through WebSocket on subsequent turns.
    return {
      sessionId,
      message,
      audioBase64: '', // Skip TTS for instant loading
    };
  }

  async endSession(sessionId: string) {
    const session = this.conversations.get(sessionId);
    if (!session) {
      return { message: 'Session not found or already ended' };
    }

    const turnCount = session.history.length;
    const userTurns = session.history.filter((h) => h.speaker === 'user');

    // 1. Build Transcript
    const transcript = session.history
      .map((t) => `${t.speaker === 'user' ? 'User' : 'Maya'}: ${t.text}`)
      .join('\n\n');

    try {
      // 2. Perform Final Analysis with Gemini
      const analysisData = await this.generateFinalRecap(session);

      // 3. Find participant record
      const dbSession = await this.prisma.conversationSession.findUnique({
        where: { id: sessionId },
        include: { participants: true },
      });
      const participant = dbSession?.participants[0];

      if (participant) {
        // 4. Create Analysis and Mistakes
        await this.prisma.analysis.create({
          data: {
            sessionId: sessionId,
            participantId: participant.id,
            scores: analysisData.scores as any,
            cefrLevel: analysisData.cefrLevel,
            rawData: {
              aiFeedback: analysisData.summary,
              strengths: analysisData.strengths,
              improvementAreas: analysisData.weaknesses,
              nextSteps: analysisData.nextSteps,
            } as any,
            mistakes: {
              create: analysisData.mistakes.map((m: any) => ({
                original: m.wrong,
                corrected: m.right,
                explanation: m.explanation,
                type: m.type || 'Grammar',
                severity: m.severity || 'medium',
                segmentId: '0',
                timestamp: 0,
              })),
            },
            pronunciationIssues: {
              create: session.pronunciationAttempts
                .filter((p) => !p.passed)
                .map((p) => ({
                  word: p.problemWords[0] || p.referenceText,
                  issueType: 'Mispronunciation',
                  severity: 'medium',
                  suggestion: `Work on "${p.referenceText}"`,
                })),
            },
          },
        });
      }

      // 5. Update Session Status
      await this.prisma.conversationSession.update({
        where: { id: sessionId },
        data: {
          status: 'COMPLETED',
          endedAt: new Date(),
          duration: Math.floor(
            (new Date().getTime() - (dbSession?.createdAt?.getTime() || 0)) /
              1000,
          ),
          feedback: {
            upsert: {
              create: { transcript },
              update: { transcript },
            },
          },
        },
      });
    } catch (error) {
      this.logger.error(
        `Final analysis failed for AI session: ${error.message}`,
      );
      // Mark session as ended anyway
      await this.prisma.conversationSession
        .update({
          where: { id: sessionId },
          data: { status: 'ENDED', endedAt: new Date() },
        })
        .catch(() => {});
    }

    this.conversations.delete(sessionId);

    return {
      message: 'Session ended and analyzed',
      turnCount,
      pronunciationAttempts: session.pronunciationAttempts.length,
    };
  }

  async generateFinalRecap(session: ConversationSession) {
    const historyStr = session.history
      .map((h) => `${h.speaker === 'user' ? 'User' : 'AI'}: ${h.text}`)
      .join('\n');

    const prompt = `
    You are Maya, the expert English tutor. You just finished a practice session with a student.
    Analyze the following conversation and provide a structured feedback report.
    
    CONVERSATION:
    ${historyStr}
    
    Format your response as a JSON object:
    {
      "summary": "A warm, personalized summary of how they did today (in Maya's Hinglish style)",
      "scores": {
        "grammar": 0-100,
        "vocabulary": 0-100,
        "fluency": 0-100,
        "pronunciation": 0-100,
        "overall": 0-100
      },
      "cefrLevel": "A1|A2|B1|B2|C1|C2",
      "strengths": ["list common strengths"],
      "weaknesses": ["list areas to improve"],
      "mistakes": [
        {
          "wrong": "what they said",
          "right": "correction",
          "explanation": "why",
          "severity": "low|medium|high",
          "type": "Grammar|Vocabulary|Fluency"
        }
      ],
      "nextSteps": ["Concrete advice for next time"]
    }
    
    Respond STRICTLY in JSON.
    `;

    const model = this.genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
    const result = await model.generateContent(prompt);
    const text = result.response.text();

    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      return JSON.parse(jsonMatch ? jsonMatch[0] : text);
    } catch (e) {
      this.logger.error(`Failed to parse final recap JSON: ${e.message}`);
      throw e;
    }
  }

  // ─── Feature 1: Pronunciation Assessment ───────────────────

  async assessPronunciation(
    audioBuffer: Buffer,
    referenceText: string,
    sessionId: string,
  ): Promise<any> {
    try {
      const form = new FormData();
      form.append('audio', audioBuffer, {
        filename: 'audio.m4a',
        contentType: 'audio/m4a',
      });
      form.append('reference_text', referenceText);

      const response = await firstValueFrom(
        this.httpService.post(
          `${this.aiBackendUrl}/api/tutor/assess-pronunciation`,
          form,
          {
            headers: { ...form.getHeaders() },
            maxBodyLength: Infinity,
            maxContentLength: Infinity,
            timeout: 30000,
          },
        ),
      );

      const result = response.data.data; // unwrap StandardResponse

      // Store assessment in session history
      const session = this.getOrCreateSession(sessionId);
      session.pronunciationAttempts.push({
        referenceText,
        accuracy: result.accuracy_score,
        passed: result.passed,
        timestamp: new Date(),
        problemWords: result.problem_words || [],
      });
      this.conversations.set(sessionId, session);

      return result;
    } catch (error) {
      const errorMessage =
        (error as any).response?.data?.detail || (error as any).message;
      this.logger.error(`Pronunciation assessment failed: ${errorMessage}`);
      throw new Error(`Pronunciation assessment failed: ${errorMessage}`, {
        cause: error,
      });
    }
  }

  async debugPhonemes(audioBuffer: Buffer, phrase: string): Promise<any> {
    try {
      const form = new FormData();
      form.append('audio', audioBuffer, {
        filename: 'audio.m4a',
        contentType: 'audio/m4a',
      });
      form.append('reference_text', phrase);

      const response = await firstValueFrom(
        this.httpService.post(
          `${this.aiBackendUrl}/api/tutor/debug-phonemes`,
          form,
          {
            headers: { ...form.getHeaders() },
            maxBodyLength: Infinity,
            maxContentLength: Infinity,
          },
        ),
      );

      return response.data.data;
    } catch (error) {
      const errorMessage =
        (error as any).response?.data?.detail || (error as any).message;
      this.logger.error(`Debug phonemes failed: ${errorMessage}`);
      throw new Error(`Debug phonemes failed: ${errorMessage}`, {
        cause: error,
      });
    }
  }

  // ─── Feature 2: Process speech with intent detection ───────

  async processSpeechWithIntent(
    audioBuffer: Buffer,
    userId: string,
    sessionId: string,
  ): Promise<any> {
    // Step 1: Transcribe with intent detection via AI Engine
    const audioBase64 = audioBuffer.toString('base64');
    const sttResponse = await firstValueFrom(
      this.httpService.post(`${this.aiBackendUrl}/api/tutor/stt`, {
        audio_base64: audioBase64,
        user_id: userId,
      }),
    );

    const sttResult = sttResponse.data.data; // unwrap StandardResponse

    // Step 2: If it's a voice command, return immediately
    if (sttResult.is_command && sttResult.intent !== 'none') {
      // Store in history
      const session = this.getOrCreateSession(sessionId);
      session.history.push({
        speaker: 'user',
        text: sttResult.text,
        timestamp: new Date(),
      });
      this.conversations.set(sessionId, session);

      return {
        transcription: sttResult.text,
        isCommand: true,
        intent: sttResult.intent,
        intentConfidence: sttResult.intent_confidence,
        matchedKeyword: sttResult.matched_keyword,
        aiResponse: null,
        correction: null,
        audioBase64: null,
      };
    }

    // Step 3: Not a command — process with Gemini as normal conversation
    const aiResult = await this.processUserUtterance(
      sessionId,
      sttResult.text,
      userId,
    );

    // Step 4: Synthesize AI response to speech
    const responseText = aiResult.response || '';
    const audioBase64Response = responseText
      ? await this.synthesizeHinglish(responseText)
      : '';

    return {
      transcription: sttResult.text,
      isCommand: false,
      intent: 'none',
      intentConfidence: 0,
      matchedKeyword: null,
      aiResponse: responseText,
      correction: aiResult.correction || null,
      audioBase64: audioBase64Response,
      phoneticInsights: sttResult.phonetic_insights || null,
    };
  }

  // ─── Verification: Generate initial greeting ───────────────

  async generateGreetingInternal(
    userId: string,
  ): Promise<{ message: string; audioBase64: string }> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    const name = user?.fname || 'Friend';
    const message = `Namaste ${name}! I'm Maya, your English tutor. Aaj hum English practice karenge — just hold the mic and speak!`;

    const audioBase64 = await this.synthesizeHinglish(message);

    return { message, audioBase64 };
  }

  // ─── Helper: get or create session ─────────────────────────

  private getOrCreateSession(sessionId: string): ConversationSession {
    let session = this.conversations.get(sessionId);
    if (!session) {
      session = { history: [], pronunciationAttempts: [] };
      this.conversations.set(sessionId, session);
    }
    return session;
  }
}
