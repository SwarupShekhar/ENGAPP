/** PostHog event names — keep stable for dashboards and funnels. */
export const AnalyticsEvents = {
  PRACTICE_CAROUSEL_VIEWED: "practice_carousel_viewed",
  PRACTICE_TASK_OPENED: "practice_task_opened",
  PRACTICE_ATTEMPT_SUBMITTED: "practice_attempt_submitted",
} as const;

export type PracticeTaskType = "pronunciation" | "grammar" | "vocabulary" | string;
