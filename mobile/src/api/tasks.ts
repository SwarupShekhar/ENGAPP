import { client } from './client';

export type LearningTaskType = 'pronunciation' | 'grammar' | 'vocabulary' | string;

export interface LearningTaskContent {
    target: string;
    userSaid: string;
    correct: string;
    severity?: string;
    type: LearningTaskType;

    // Extra fields produced by backend (safe to ignore by callers)
    severityScore?: number;
    repetition?: number;
    phonemes?: {
        actual?: string | null;
        expected?: string | null;
    };
    focusWords?: string[];
    referenceText?: string;
}

export interface LearningTask {
    id: string;
    type: LearningTaskType;
    title: string;
    content: LearningTaskContent;
    sessionId: string | null;
    status: string;
    createdAt: string;
    correctStreak?: number;
    session?: {
        id: string;
        createdAt: string;
    } | null;
}

export const tasksApi = {
    /**
     * Get pending tasks across all sessions.
     * GET /users/me/tasks/pending
     */
    getPendingTasks: async (): Promise<LearningTask[]> => {
        const response = await client.get('/users/me/tasks/pending');
        return response.data?.tasks ?? [];
    },

    /**
     * Mark a task as completed.
     * PATCH /tasks/:taskId/complete
     */
    completeTask: async (taskId: string): Promise<LearningTask> => {
        const response = await client.patch(`/tasks/${taskId}/complete`);
        return response.data;
    },

    /**
     * Explicitly generate tasks for a session (idempotent server-side).
     * POST /sessions/:sessionId/tasks/generate
     */
    generateTasksForSession: async (sessionId: string): Promise<LearningTask[]> => {
        const response = await client.post(`/sessions/${sessionId}/tasks/generate`);
        return response.data?.tasks ?? [];
    },

    /** Due spaced-repetition cards. GET /tasks/due */
    getDueTasks: async (): Promise<LearningTask[]> => {
        const response = await client.get('/tasks/due');
        return response.data?.tasks ?? [];
    },

    /** Home carousel queue (due + pending, deduped). GET /users/me/tasks/carousel */
    getCarouselTasks: async (): Promise<LearningTask[]> => {
        const response = await client.get('/users/me/tasks/carousel');
        return response.data?.tasks ?? [];
    },

    /**
     * Best-effort load for home practice slides — never throws; returns [] on total failure.
     */
    loadPracticeCarouselTasks: async (): Promise<LearningTask[]> => {
        const seen = new Set<string>();
        const merged: LearningTask[] = [];
        const add = (tasks: LearningTask[]) => {
            for (const t of tasks) {
                if (!t?.id || seen.has(t.id)) continue;
                seen.add(t.id);
                merged.push(t);
            }
        };

        const loaders: Array<() => Promise<LearningTask[]>> = [
            () => tasksApi.getCarouselTasks(),
            () => tasksApi.getDueTasks(),
            () => tasksApi.getPendingTasks(),
            async () => {
                const response = await client.get('/tasks/daily');
                return response.data?.tasks ?? [];
            },
        ];

        for (const load of loaders) {
            try {
                add(await load());
                if (merged.length >= 8) break;
            } catch {
                // try next source
            }
        }

        return merged.slice(0, 8);
    },

    /** Submit a practice attempt. POST /tasks/:id/attempt */
    submitAttempt: async (
        taskId: string,
        payload: { transcript?: string; audioUri?: string },
    ): Promise<{
        pass: boolean;
        errored: boolean;
        reason?: string;
        srState?: string;
        correctStreak?: number;
        graduated?: boolean;
        dueAt?: string;
    }> => {
        const form = new FormData();
        if (payload.transcript) form.append('transcript', payload.transcript);
        if (payload.audioUri) {
            form.append('audio', {
                uri: payload.audioUri,
                type: 'audio/m4a',
                name: 'audio.m4a',
            } as any);
        }
        const response = await client.post(`/tasks/${taskId}/attempt`, form, {
            headers: { 'Content-Type': 'multipart/form-data' },
            timeout: 30000,
        });
        return response.data;
    },

    getMasteredCount: async (): Promise<number> => {
        const r = await client.get('/tasks/mastered-count');
        return r.data?.count ?? 0;
    },
};

