import { client } from './client';

export const tutorApi = {
    startSession: async (userId: string) => {
        const res = await client.post('/conversational-tutor/start-session', { userId });
        return res.data;
    },

    processSpeech: async (formData: FormData) => {
        const res = await client.post('/conversational-tutor/process-speech', formData, {
            headers: { 'Content-Type': 'multipart/form-data' },
            timeout: 120000, // 2 min for STT + Gemini + TTS pipeline
        });
        return res.data;
    },

    assessPronunciation: async (formData: FormData) => {
        const res = await client.post('/conversational-tutor/assess-pronunciation', formData, {
            headers: { 'Content-Type': 'multipart/form-data' },
            timeout: 30000, // 30s for pronunciation assessment
        });
        return res.data;
    },



    transcribe: async (formData: FormData) => {
        const res = await client.post('/conversational-tutor/transcribe', formData, {
            headers: { 'Content-Type': 'multipart/form-data' },
            timeout: 15000,
        });
        return res.data;
    },

    endSession: async (sessionId: string) => {
        const res = await client.post('/conversational-tutor/end-session', { sessionId });
        return res.data;
    },
};
