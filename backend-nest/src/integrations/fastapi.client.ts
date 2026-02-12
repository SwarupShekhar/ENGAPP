import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

@Injectable()
export class FastApiClient {
    private readonly logger = new Logger(FastApiClient.name);
    private readonly baseUrl: string;

    constructor(private configService: ConfigService) {
        this.baseUrl = this.configService.get<string>('FASTAPI_SERVICE_URL') || 'http://localhost:8000';
    }

    async transcribe(audioUrl: string, sessionId: string) {
        try {
            const response = await axios.post(`${this.baseUrl}/api/transcribe`, {
                audio_url: audioUrl,
                session_id: sessionId,
            });
            return response.data;
        } catch (error) {
            this.logger.error(`Failed to call FastAPI transcribe: ${error.message}`);
            throw error;
        }
    }

    async analyze(transcript: string, sessionId: string, userId: string) {
        try {
            const response = await axios.post(`${this.baseUrl}/api/analyze`, {
                transcript,
                session_id: sessionId,
                user_id: userId,
            });
            return response.data;
        } catch (error) {
            this.logger.error(`Failed to call FastAPI analyze: ${error.message}`);
            throw error;
        }
    }
}
