import { client, API_URL } from './client';

export const tutorApi = {
    startSession: async (userId: string) => {
        const res = await client.post('/conversational-tutor/start-session', { userId });
        return res.data;
    },

    /** Blocking flow (STT → Gemini → TTS). Use for fallback or when SSE not available. */
    processSpeech: async (formData: FormData) => {
        const res = await client.post('/conversational-tutor/process-speech', formData, {
            headers: { 'Content-Type': 'multipart/form-data' },
            timeout: 120000, // 2 min for STT + Gemini + TTS pipeline
        });
        return res.data;
    },

    /**
     * Stream tutor response via SSE. Returns a Response with body.getReader() for text/event-stream.
     * Pass auth headers (e.g. Authorization: `Bearer ${await getToken()}`) for authenticated requests.
     */
    streamSpeech: (
        formData: FormData,
        headers?: Record<string, string>,
    ): Promise<Response> => {
        return fetch(`${API_URL}/conversational-tutor/stream-speech`, {
            method: 'POST',
            body: formData,
            headers: {
                Accept: 'text/event-stream',
                ...(headers ?? {}),
            },
        });
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

    /** After SSE stream completes, append the turn so next request has correct history. */
    appendTurn: async (sessionId: string, userText: string, aiText: string) => {
        await client.post('/conversational-tutor/append-turn', {
            sessionId,
            userText,
            aiText,
        });
    },

    endSession: async (sessionId: string) => {
        const res = await client.post('/conversational-tutor/end-session', { sessionId });
        return res.data;
    },
};
