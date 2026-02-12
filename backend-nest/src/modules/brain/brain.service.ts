import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenerativeAI, GenerationConfig } from '@google/generative-ai';

@Injectable()
export class BrainService {
    private genAI: GoogleGenerativeAI;
    private model: any;

    constructor(private configService: ConfigService) {
        const apiKey = this.configService.get<string>('GEMINI_API_KEY') || this.configService.get<string>('GOOGLE_LANGUAGE_API_KEY');
        if (!apiKey) {
            throw new Error('GEMINI_API_KEY is not defined');
        }
        this.genAI = new GoogleGenerativeAI(apiKey);
        this.model = this.genAI.getGenerativeModel({ model: "gemini-1.5-flash" }); // Using flash for speed/cost
    }

    async analyzeImageDescription(transcript: string, imageLevel: string, imageDescription: string) {
        const prompt = `
        Analyze this English speaking sample.
        Image description level: ${imageLevel}
        Shown image description: "${imageDescription}"
        User transcript: "${transcript}"

        Return EXACT JSON:
        {
            "grammarScore": number (0-100),
            "vocabularyCEFR": "A1|A2|B1|B2|C1|C2",
            "relevanceScore": number (0-100),
            "talkStyle": "DRIVER|PASSENGER"
        }

        Rules:
        - grammarScore: penalize tense/article/preposition errors
        - vocabularyCEFR: classify sophistication
        - relevanceScore: how well image described
        - DRIVER if >30 words + detailed
        - PASSENGER otherwise
        `;

        const generationConfig: GenerationConfig = {
            temperature: 0.2,
            responseMimeType: "application/json",
        };

        try {
            const result = await this.model.generateContent({
                contents: [{ role: 'user', parts: [{ text: prompt }] }],
                generationConfig,
            });
            const response = await result.response;
            const text = response.text();
            return JSON.parse(text);
        } catch (error) {
            console.error("Gemini Phase 3 Error:", error);
            return this.ruleBasedFallback(transcript);
        }
    }

    private ruleBasedFallback(transcript: string) {
        const wordCount = transcript.split(/\s+/).filter(w => w.length > 0).length;
        return {
            grammarScore: 70,
            vocabularyCEFR: wordCount > 20 ? "B1" : "A2",
            relevanceScore: 75,
            talkStyle: wordCount > 30 ? "DRIVER" : "PASSENGER"
        };
    }

    async interpretAzureEvidence(transcript: string, evidence: any) {
        const prompt = `
        Analyze the following English speech transcript and pronunciation scores.
        Provide feedback in JSON format:
        {
            "corrected": "Corrected sentence",
            "explanation": "Grammar rule explanation",
            "severity": "low|medium|high",
            "pronunciationTip": "Tip for improvement",
            "mistakes": [
                { "original": "word", "corrected": "word", "type": "grammar|vocab|pronunciation" }
            ]
        }

        Transcript: "${transcript}"
        Evidence/Scores: ${JSON.stringify(evidence)}
        `;

        try {
            const result = await this.model.generateContent(prompt);
            const response = await result.response;
            const text = response.text();
            const cleanText = text.replace(/```json/g, '').replace(/```/g, '').trim();
            return JSON.parse(cleanText);
        } catch (error) {
            console.error("Gemini Error:", error);
            return {
                original: transcript,
                corrected: transcript,
                explanation: "AI service temporarily unavailable.",
                severity: "low",
                pronunciationTip: "Keep practicing!",
                mistakes: []
            };
        }
    }
}
