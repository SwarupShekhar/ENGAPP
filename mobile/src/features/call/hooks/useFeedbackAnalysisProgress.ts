import { useMemo } from "react";
import type { ConversationSession } from "../../../api/sessions";
import {
  deriveChecklistStates,
  detectWaitingForPartner,
  isDoneSignals,
  type ChecklistItemKey,
  type ItemState,
} from "../utils/feedbackAnalysisSignals";

export type FeedbackAnalysisMode = "partner_wait" | "analysis_wait";

export interface UseFeedbackAnalysisProgressInput {
  sessionData: ConversationSession | null;
  cqsData: unknown | null;
  retryCount: number;
  loading: boolean;
  /** Usually false while loading=true; true when exit criteria are met. */
  aboutToExitLoading?: boolean;
}

export interface UseFeedbackAnalysisProgressResult {
  mode: FeedbackAnalysisMode;
  checklistItems: Record<ChecklistItemKey, ItemState>;
  headerTitle: string;
  headerSubtitle: string;
  hintText?: string;
}

const ANALYSIS_DEFAULT = {
  headerTitle: "AI is analyzing your conversation",
  headerSubtitle:
    "We're preparing your personalized feedback and corrections.",
  hintText: "This usually takes less than 2 minutes.",
} as const;

const ANALYSIS_LONG_WAIT = {
  headerTitle: "Still working...",
  headerSubtitle:
    "This session had a lot of great conversation! It's taking a bit longer to analyze.",
} as const;

const PARTNER_WAIT = {
  headerTitle: "Waiting for your partner",
  headerSubtitle:
    "Ask your partner to end the call so we can analyze the conversation.",
} as const;

const EMPTY_CHECKLIST: Record<ChecklistItemKey, ItemState> = {
  speech_quality: "pending",
  grammar: "pending",
  vocabulary: "pending",
  pronunciation: "pending",
  final_report: "pending",
};

/**
 * Derives loading-mode UI copy + checklist item states (Spec §7 / §9.3).
 * Pure presentation — does not change when loading exits.
 */
export function useFeedbackAnalysisProgress(
  input: UseFeedbackAnalysisProgressInput,
): UseFeedbackAnalysisProgressResult {
  const {
    sessionData,
    cqsData,
    retryCount,
    loading: _loading,
    aboutToExitLoading = false,
  } = input;

  return useMemo(() => {
    const waitingForPartner = detectWaitingForPartner(sessionData);

    if (waitingForPartner) {
      return {
        mode: "partner_wait" as const,
        checklistItems: EMPTY_CHECKLIST,
        headerTitle: PARTNER_WAIT.headerTitle,
        headerSubtitle: PARTNER_WAIT.headerSubtitle,
      };
    }

    const done = isDoneSignals(sessionData, {
      hasCqs: Boolean(cqsData),
      aboutToExitLoading,
    });

    // Spec §5.2: activate after first poll response (session payload present and/or retry advanced)
    const checklistItems = deriveChecklistStates(done, {
      hasFirstPoll: retryCount > 0 || sessionData != null,
    });

    const isLongWait = retryCount >= 5;
    if (isLongWait) {
      return {
        mode: "analysis_wait" as const,
        checklistItems,
        headerTitle: ANALYSIS_LONG_WAIT.headerTitle,
        headerSubtitle: ANALYSIS_LONG_WAIT.headerSubtitle,
      };
    }

    return {
      mode: "analysis_wait" as const,
      checklistItems,
      headerTitle: ANALYSIS_DEFAULT.headerTitle,
      headerSubtitle: ANALYSIS_DEFAULT.headerSubtitle,
      hintText: ANALYSIS_DEFAULT.hintText,
    };
    // `loading` reserved for parent integration; checklist is presentation-only
  }, [sessionData, cqsData, retryCount, aboutToExitLoading]);
}
