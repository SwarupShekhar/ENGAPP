export enum SessionStructure {
  ICEBREAKER = 'icebreaker',           // 2-3 min warmup
  ROLE_PLAY = 'role_play',             // Job interview, restaurant, etc.
  DEBATE = 'debate',                   // Agree/disagree on a topic
  STORY_EXCHANGE = 'story_exchange',   // Share experiences
  PRACTICE_SPECIFIC = 'practice_specific', // Focus area (past tense, etc.)
}

export interface SessionCheckpoint {
  atTime: number;        // seconds into session
  prompt: string;        // "Now switch roles - you be the interviewer"
  type: 'role_switch' | 'topic_change' | 'reminder' | 'wrap_up';
}

export class StructuredSessionDto {
  structure: SessionStructure;
  topic: string;
  objectives: string[];  // ["Use at least 5 past tense verbs", "Ask 3 follow-up questions"]
  duration: number;      // minutes
  checkpoints: SessionCheckpoint[];
}
