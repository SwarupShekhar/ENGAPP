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
You are Priya, a friendly English tutor who speaks Hinglish (Hindi + English mix).

YOUR PERSONALITY:
- Warm, encouraging, patient like a supportive older sister
- You code-switch naturally between Hindi and English
- You celebrate small wins enthusiastically
- You correct errors gently without making the learner feel bad

YOUR TEACHING STYLE:
1. Listen to what the user says
2. If there's an error:
   - Acknowledge what they said (show you understood)
   - Gently correct using the sandwich method: compliment → correction → encouragement
   - Ask them to repeat the correct form
3. If correct:
   - Celebrate briefly
   - Continue the conversation naturally
4. Keep the conversation flowing - don't lecture

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
  "response": "your conversational response mixing Hindi/English",
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
Respond naturally as Priya. Always use JSON format.
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
    this.genAI = new GoogleGenerativeAI(this.configService.get<string>('GOOGLE_API_KEY'));
    this.aiBackendUrl = this.configService.get<string>('AI_BACKEND_URL') || 'http://localhost:8001';
  }

  // ─── Existing: Process user utterance with Gemini ──────────

  async processUserUtterance(sessionId: string, userUtterance: string, userId: string) {
    const session = this.getOrCreateSession(sessionId);

    // Build conversation history for context
    const historyStr = session.history
      .slice(-10) // last 10 turns
      .map(t => `${t.speaker === 'user' ? 'User' : 'Priya'}: ${t.text}`)
      .join('\n');

    const model = this.genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
    const prompt = CONVERSATIONAL_TUTOR_PROMPT
      .replace('{user_utterance}', userUtterance)
      .replace('{conversation_history}', historyStr || '(start of conversation)');

    const result = await model.generateContent(prompt);
    const responseText = result.response.text();

    // Parse JSON from Gemini response
    let responseJson: any;
    try {
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      responseJson = jsonMatch ? JSON.parse(jsonMatch[0]) : { response: responseText };
    } catch (e) {
      this.logger.error(`Failed to parse Gemini response: ${e.message}`);
      responseJson = { response: responseText };
    }

    // Store history
    session.history.push({ speaker: 'user', text: userUtterance, timestamp: new Date() });
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
    const audioBase64 = audioBuffer.toString('base64');
    const response = await firstValueFrom(
      this.httpService.post(`${this.aiBackendUrl}/api/tutor/stt`, {
        audio_base64: audioBase64,
        user_id: userId,
      }),
    );
    return response.data.data;
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

  async endSession(sessionId: string) {
    const session = this.conversations.get(sessionId);
    const turnCount = session?.history?.length || 0;
    const pronunciationAttempts = session?.pronunciationAttempts?.length || 0;
    this.conversations.delete(sessionId);
    return {
      message: 'Session ended',
      turnCount,
      pronunciationAttempts,
    };
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
      const errorMessage = error.response?.data?.detail || error.message;
      this.logger.error(`Pronunciation assessment failed: ${errorMessage}`);
      throw new Error(`Pronunciation assessment failed: ${errorMessage}`);
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
    const aiResult = await this.processUserUtterance(sessionId, sttResult.text, userId);

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
    };
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
