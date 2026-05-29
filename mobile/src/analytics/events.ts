/** PostHog event names — keep stable for dashboards and funnels. */
export const AnalyticsEvents = {
  APP_OPENED: "app_opened",
  FIRST_CALL_STARTED: "first_call_started",
  FIRST_CALL_COMPLETED: "first_call_completed",
  PRACTICE_CAROUSEL_VIEWED: "practice_carousel_viewed",
  PRACTICE_TASK_OPENED: "practice_task_opened",
  PRACTICE_ATTEMPT_SUBMITTED: "practice_attempt_submitted",
  PRON_FEEDBACK_REQUESTED: "pron_feedback_requested",
  AZURE_PROSODY_STARTED: "azure_prosody_started",
  AZURE_PROSODY_COMPLETED: "azure_prosody_completed",
  AZURE_PROSODY_FAILED: "azure_prosody_failed",
  FEEDBACK_RENDERED: "feedback_rendered",
  FEEDBACK_HELPFUL_YES: "feedback_helpful_yes",
  FEEDBACK_HELPFUL_NO: "feedback_helpful_no",
  CALL_STARTED: "call_started",
  CALL_ENDED: "call_ended",
  AI_TUTOR_OPENED: "ai_tutor_opened",
  WORD_OF_DAY_PUSH_RECEIVED: "word_of_day_push_received",
  WORD_OF_DAY_PUSH_TAPPED: "word_of_day_push_tapped",
  /** Emitted from backend-nest when Pushy delivery succeeds */
  WORD_OF_DAY_PUSH_SENT: "word_of_day_push_sent",
} as const;

export type PracticeTaskType = "pronunciation" | "grammar" | "vocabulary" | string;
