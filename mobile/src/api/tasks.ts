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
}

export interface LearningTask {
    id: string;
    type: LearningTaskType;
    title: string;
    content: LearningTaskContent;
    sessionId: string | null;
    status: string;
    createdAt: string;
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
};

