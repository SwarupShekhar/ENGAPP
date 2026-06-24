import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { firstValueFrom } from 'rxjs';
import { aiEngineAuthHeaders } from '../../common/ai-engine-auth';
import { PrismaService } from '../../database/prisma/prisma.service';
import { WeaknessService } from '../reels/weakness.service';
import { InCallCoachingService } from '../in-call-coaching/in-call-coaching.service';
import * as FormData from 'form-data';
import { Response } from 'express';

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
You are Maya, a calm, warm spoken-English tutor for adult learners.

LANGUAGE (absolute):
- Reply in clear, natural ENGLISH ONLY. No Hindi, Hinglish, Urdu, or mixed language.
- No Hindi words (no "arre", "shabash", "namaste", "koi baat nahi", "acha", "bhai", etc.).
- If the learner uses Hindi, respond in English and gently model the English version.

Teaching:
- Correct only ONE high-impact issue per turn; embed corrections naturally in your reply.
- Ask one short follow-up question so they speak more.
- Sound like a skilled human tutor — not robotic, not hype.

Style:
- STRICT: 1-2 short sentences total. This is spoken aloud.
- No bullet points, headers, JSON, markdown, or emojis.
- Never say "Great question!", "Certainly!", or mention being an AI.
- Never use familial terms (bhai, didi, bro, sister).

CONVERSATION HISTORY:
{conversation_history}

User just said: "{user_utterance}"

Reply with ONLY Maya's spoken English (1-2 sentences). Nothing else.
`;

/** Common short phrases — cache TTS at startup to save ~1–2s when matched. */
const TTS_CACHE_PHRASES = [
  'Nice work!',
  'Well done!',
  'No worries.',
  "That's really good!",
  'Hi there!',
  "You're welcome!",
];

/** Default chat model (flash-lite retired for new Google AI API projects). */
const DEFAULT_GEMINI_CHAT_MODEL = 'gemini-2.5-flash';

@Injectable()
export class ConversationalTutorService implements OnModuleInit {
  private readonly logger = new Logger(ConversationalTutorService.name);
  private genAI: GoogleGenerativeAI;
  private conversations: Map<string, ConversationSession> = new Map();
  private aiBackendUrl: string;
  private readonly aiHeaders: Record<string, string>;
  private readonly ttsCache = new Map<string, string>();
  private readonly geminiChatModel: string;

  constructor(
    private configService: ConfigService,
    private httpService: HttpService,
    private prisma: PrismaService,
    private weaknessService: WeaknessService,
    private inCallCoaching: InCallCoachingService,
  ) {
    this.genAI = new GoogleGenerativeAI(
      this.configService.get<string>('GEMINI_API_KEY'),
    );
    this.geminiChatModel =
      this.configService.get<string>('GEMINI_CHAT_MODEL')?.trim() ||
      DEFAULT_GEMINI_CHAT_MODEL;
    this.aiBackendUrl =
      this.configService.get<string>('AI_ENGINE_URL') ||
      'http://localhost:8001';
    this.aiHeaders = aiEngineAuthHeaders(this.configService);
  }

  private withAiAuth(options?: Record<string, unknown>) {
    const opts = (options ?? {}) as { headers?: Record<string, string> };
    return {
      ...opts,
      headers: { ...this.aiHeaders, ...opts.headers },
    };
  }

  private getChatModel() {
    return this.genAI.getGenerativeModel({
      model: this.geminiChatModel,
      generationConfig: {
        maxOutputTokens: 120,
        temperature: 0.75,
      },
    });
  }

  async onModuleInit() {
    for (const phrase of TTS_CACHE_PHRASES) {
      try {
        const response = await firstValueFrom(
          this.httpService.post(
            `${this.aiBackendUrl}/api/tutor/tts`,
            {
              text: phrase,
              gender: 'female',
            },
            this.withAiAuth(),
          ),
        );
        const base64 = response.data?.data?.audio_base64;
        if (base64) {
          this.ttsCache.set(phrase.trim(), base64);
        }
      } catch (e) {
        this.logger.warn(`TTS cache skip "${phrase}": ${(e as Error).message}`);
      }
    }
    if (this.ttsCache.size > 0) {
      this.logger.log(`TTS cache warmed: ${this.ttsCache.size} phrases`);
    }
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
      .slice(-6) // last 6 turns — enough context, fewer tokens = faster
      .map((t) => `${t.speaker === 'user' ? 'User' : 'Maya'}: ${t.text}`)
      .join('\n');

    const model = this.getChatModel();
    const prompt = CONVERSATIONAL_TUTOR_PROMPT.replace(
      '{user_utterance}',
      userUtterance,
    ).replace(
      '{conversation_history}',
      historyStr || '(start of conversation)',
    );

    const result = await model.generateContent(prompt);
    const responseText = result.response.text().trim();

    // Plain-text replies are the default; legacy JSON responses still parse if present.
    let responseJson: { response: string; correction?: unknown; follow_up?: string };
    if (responseText.startsWith('{')) {
      try {
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        responseJson = jsonMatch
          ? JSON.parse(jsonMatch[0])
          : { response: responseText };
      } catch (e) {
        this.logger.warn(`Gemini JSON parse failed, using plain text: ${(e as Error).message}`);
        responseJson = { response: responseText };
      }
    } else {
      responseJson = { response: responseText };
    }

    const spokenReply =
      [responseJson.response, responseJson.follow_up].filter(Boolean).join(' ').trim() ||
      responseText;

    // Store history
    session.history.push({
      speaker: 'user',
      text: userUtterance,
      timestamp: new Date(),
    });
    session.history.push({
      speaker: 'ai',
      text: spokenReply,
      timestamp: new Date(),
      corrections: responseJson.correction ? [responseJson.correction] : [],
    });
    this.conversations.set(sessionId, session);

    return { ...responseJson, response: spokenReply };
  }

  // ─── Existing: Transcribe Hinglish via AI Engine ───────────

  async transcribeHinglish(audioBuffer: Buffer, userId: string) {
    try {
      const audioBase64 = audioBuffer.toString('base64');
      const response = await firstValueFrom(
        this.httpService.post(
          `${this.aiBackendUrl}/api/tutor/stt`,
          {
            audio_base64: audioBase64,
            user_id: userId,
          },
          this.withAiAuth(),
        ),
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
    const key = text.trim();
    const cached = this.ttsCache.get(key);
    if (cached) return cached;
    try {
      const response = await firstValueFrom(
        this.httpService.post(
          `${this.aiBackendUrl}/api/tutor/tts`,
          {
            text: text,
            gender: 'female',
          },
          this.withAiAuth(),
        ),
      );
      return response.data.data.audio_base64;
    } catch (error) {
      this.logger.error(`TTS synthesis failed: ${error.message}`);
      return '';
    }
  }

  // ─── Existing: End session ─────────────────────────────────

  async startSession(userId: string) {
    // 1. Create session in DB + get user name + CEFR level in parallel
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
        select: { fname: true, overallLevel: true },
      }),
    ]);

    const sessionId = dbSession.id;
    const name = user?.fname || 'Friend';
    const cefrLevel = user?.overallLevel || null;
    // English-only greeting. Maya adapts vocabulary to the learner's CEFR level on subsequent turns.
    const message = `Hi ${name}, I'm Maya, your English tutor. Hold the mic and start speaking — I'll listen and help you sound more natural.`;

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

    // 3. Pre-build coaching context so backend-ai can read hints mid-session. Fire-and-forget.
    this.inCallCoaching.buildContext(userId, sessionId).catch((err) => {
      this.logger.warn(`[Coaching] failed to pre-build context for tutor session=${sessionId}: ${err?.message ?? err}`);
    });

    // 4. Return immediately — NO TTS for greeting (saves 1-2s).
    //    Mobile pipes `cefrLevel` into the WS fallback path so backend-ai can adapt
    //    when the SSE → Nest CEFR injection is skipped.
    return {
      sessionId,
      message,
      audioBase64: '', // Skip TTS for instant loading
      cefrLevel,
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

        // ─── Smart Coach: Sync weaknesses to eBites feed ──────
        // This bridges session analysis → eBites personalization.
        try {
          await this.weaknessService.ingestFromSessionAnalysis(
            participant.userId,
            analysisData.mistakes || [],
            session.pronunciationAttempts
              .filter((p) => !p.passed)
              .map((p) => ({
                issueType: 'pronunciation',
                word: p.problemWords[0] || p.referenceText,
              })),
          );
        } catch (weaknessError) {
          this.logger.warn(
            `Failed to sync weaknesses to eBites: ${weaknessError.message}`,
          );
        }
      }

      // 5. Update Session Status and store transcript as one participant's feedback
      const durationSec = Math.floor(
        (new Date().getTime() - (dbSession?.createdAt?.getTime() || 0)) /
          1000,
      );
      await this.prisma.conversationSession.update({
        where: { id: sessionId },
        data: {
          status: 'COMPLETED',
          endedAt: new Date(),
          duration: durationSec,
        },
      });
      if (participant) {
        const segments = [
          {
            speaker_id: participant.userId,
            text: transcript,
            timestamp: 0,
          },
        ];
        await this.prisma.feedback.upsert({
          where: {
            sessionId_participantId: { sessionId, participantId: participant.id },
          },
          create: {
            sessionId,
            participantId: participant.id,
            transcript: segments as any,
          },
          update: { transcript: segments as any },
        });
      }
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
      "summary": "A warm, personalized summary in clear English",
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

    const model = this.getChatModel();
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
    requestId?: string,
  ): Promise<any> {
    const requestTag = requestId || `pron_${sessionId}_${Date.now()}`;
    const startedAt = Date.now();
    this.logger.log(
      JSON.stringify({
        event: 'azure_prosody_started',
        request_id: requestTag,
        session_id: sessionId,
        reference_text_len: referenceText?.length ?? 0,
      }),
    );
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
          this.withAiAuth({
            headers: { ...form.getHeaders() },
            maxBodyLength: Infinity,
            maxContentLength: Infinity,
            timeout: 30000,
          }),
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

      this.logger.log(
        JSON.stringify({
          event: 'azure_prosody_completed',
          request_id: requestTag,
          session_id: sessionId,
          latency_ms: Date.now() - startedAt,
          passed: Boolean(result.passed),
          accuracy_score: Number(result.accuracy_score ?? 0),
        }),
      );

      return { ...result, requestId: requestTag };
    } catch (error) {
      const errorMessage =
        (error as any).response?.data?.detail || (error as any).message;
      this.logger.error(
        JSON.stringify({
          event: 'azure_prosody_failed',
          request_id: requestTag,
          session_id: sessionId,
          latency_ms: Date.now() - startedAt,
          error_code: (error as any).response?.status ?? 'unknown',
          error_message: errorMessage,
        }),
      );
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
          this.withAiAuth({
            headers: { ...form.getHeaders() },
            maxBodyLength: Infinity,
            maxContentLength: Infinity,
          }),
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

  /**
   * Stream tutor response via SSE: pipe backend-ai /stream-response to client.
   * Caller must set res headers (Content-Type: text/event-stream) before calling.
   */
  async pipeStreamSpeechResponse(
    audioBuffer: Buffer,
    userId: string,
    sessionId: string,
    res: Response,
    traceId?: string,
    uploadFilename = 'audio.m4a',
    uploadMime = 'audio/m4a',
  ): Promise<void> {
    const session = this.getOrCreateSession(sessionId);
    const history = session.history
      .slice(-6)
      .map((t) => ({ role: t.speaker, content: t.text }));

    // Maya tutor adapts vocabulary + sentence length to learner's CEFR level.
    // overallLevel is the authoritative current CEFR (synced after each session).
    let cefrLevel: string | null = null;
    try {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { overallLevel: true },
      });
      cefrLevel = user?.overallLevel ?? null;
    } catch (e) {
      this.logger.warn(`CEFR lookup failed for ${userId}: ${(e as Error).message}`);
    }

    const form = new FormData();
    form.append('audio', audioBuffer, {
      filename: uploadFilename,
      contentType: uploadMime,
    });
    form.append('session_id', sessionId);
    form.append('user_id', userId);
    form.append('conversation_history', JSON.stringify(history));
    if (traceId) {
      form.append('trace_id', traceId);
    }
    if (cefrLevel) {
      form.append('cefr_level', cefrLevel);
    }

    const url = `${this.aiBackendUrl}/api/tutor/stream-response`;
    try {
      const response = await firstValueFrom(
        this.httpService.post(
          url,
          form,
          this.withAiAuth({
            responseType: 'stream',
            headers: form.getHeaders(),
            maxContentLength: Infinity,
            maxBodyLength: Infinity,
          }),
        ),
      );
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      (response.data as NodeJS.ReadableStream).pipe(res);
    } catch (err: any) {
      this.logger.error(`stream-speech upstream error: ${err.message}`);
      res.status(err.response?.status || 500).json({
        error: err.response?.data?.message || err.message,
      });
    }
  }

  // ─── Feature 2: Process speech with intent detection (blocking fallback) ───────

  async processSpeechWithIntent(
    audioBuffer: Buffer,
    userId: string,
    sessionId: string,
  ): Promise<any> {
    // Step 1: STT and session in parallel (session ready when STT returns)
    const audioBase64 = audioBuffer.toString('base64');
    const [sttResponse, session] = await Promise.all([
      firstValueFrom(
        this.httpService.post(
          `${this.aiBackendUrl}/api/tutor/stt`,
          {
            audio_base64: audioBase64,
            user_id: userId,
          },
          this.withAiAuth(),
        ),
      ),
      Promise.resolve(this.getOrCreateSession(sessionId)),
    ]);

    const sttResult = sttResponse.data.data; // unwrap StandardResponse

    // Step 2: If it's a voice command, return immediately
    if (sttResult.is_command && sttResult.intent !== 'none') {
      // Store in history
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
    const message = `Hi ${name}, I'm Maya, your English tutor. Hold the mic and start speaking — I'll listen and help you sound more natural.`;

    const audioBase64 = await this.synthesizeHinglish(message);

    return { message, audioBase64 };
  }

  /**
   * Append a turn to in-memory session history after SSE stream completes.
   * Ensures the next stream-speech request has correct context.
   */
  appendTurn(
    sessionId: string,
    userText: string,
    aiText: string,
  ): void {
    const session = this.getOrCreateSession(sessionId);
    session.history.push({ speaker: 'user', text: userText, timestamp: new Date() });
    session.history.push({ speaker: 'ai', text: aiText, timestamp: new Date(), corrections: [] });
    this.conversations.set(sessionId, session);
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
