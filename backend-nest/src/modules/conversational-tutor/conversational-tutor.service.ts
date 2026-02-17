import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { firstValueFrom } from 'rxjs';
import { PrismaService } from '../../database/prisma/prisma.service';

interface ConversationTurn {
  speaker: 'user' | 'ai';
  text: string;
  timestamp: Date;
  corrections?: any[];
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
When you detect an error, respond in this format:
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

User just said: "{user_utterance}"
Respond naturally as Priya.
`;

@Injectable()
export class ConversationalTutorService {
  private readonly logger = new Logger(ConversationalTutorService.name);
  private genAI: GoogleGenerativeAI;
  private conversations: Map<string, ConversationTurn[]> = new Map();
  private aiBackendUrl: string;

  constructor(
    private configService: ConfigService,
    private httpService: HttpService,
    private prisma: PrismaService,
  ) {
    this.genAI = new GoogleGenerativeAI(this.configService.get<string>('GOOGLE_API_KEY'));
    this.aiBackendUrl = this.configService.get<string>('AI_BACKEND_URL') || 'http://localhost:8001';
  }

  async processUserUtterance(sessionId: string, userUtterance: string, userId: string) {
    const history = this.conversations.get(sessionId) || [];
    
    // Call Gemini
    const model = this.genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
    const prompt = CONVERSATIONAL_TUTOR_PROMPT.replace('{user_utterance}', userUtterance);
    
    const result = await model.generateContent(prompt);
    const responseText = result.response.text();
    
    // Attempt to parse JSON from Gemini response
    let responseJson;
    try {
      // Find JSON block if it exists
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      responseJson = jsonMatch ? JSON.parse(jsonMatch[0]) : { response: responseText };
    } catch (e) {
      this.logger.error(`Failed to parse Gemini response: ${e.message}`);
      responseJson = { response: responseText };
    }

    // Store history
    history.push({ speaker: 'user', text: userUtterance, timestamp: new Date() });
    history.push({ speaker: 'ai', text: responseJson.response, timestamp: new Date() });
    this.conversations.set(sessionId, history);

    return responseJson;
  }

  async transcribeHinglish(audioBuffer: Buffer, userId: string) {
    const audioBase64 = audioBuffer.toString('base64');
    const response = await firstValueFrom(
      this.httpService.post(`${this.aiBackendUrl}/api/tutor/stt`, {
        audio_base64: audioBase64,
        user_id: userId,
      })
    );
    return response.data.data;
  }

  async synthesizeHinglish(text: string) {
    const response = await firstValueFrom(
      this.httpService.post(`${this.aiBackendUrl}/api/tutor/tts`, {
        text: text,
        gender: 'female',
      })
    );
    return response.data.data.audio_base64;
  }

  async endSession(sessionId: string) {
    const history = this.conversations.get(sessionId) || [];
    this.conversations.delete(sessionId);
    return {
        message: "Session ended",
        turnCount: history.length
    };
  }
}
