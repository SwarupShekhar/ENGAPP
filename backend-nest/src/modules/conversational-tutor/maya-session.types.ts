export interface MayaConversationTurn {
  speaker: 'user' | 'ai';
  text: string;
  timestamp: Date;
  corrections?: unknown[];
}

export interface MayaPronunciationAttempt {
  referenceText: string;
  accuracy: number;
  passed: boolean;
  timestamp: Date;
  problemWords: string[];
}

/** In-flight Maya tutor state (Redis-backed, not the Prisma ConversationSession row). */
export interface MayaConversationSession {
  history: MayaConversationTurn[];
  pronunciationAttempts: MayaPronunciationAttempt[];
}
