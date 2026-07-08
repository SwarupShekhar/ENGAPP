import type { ConversationSession } from "../../../api/sessions";

export type ChecklistItemKey =
  | "speech_quality"
  | "grammar"
  | "vocabulary"
  | "pronunciation"
  | "final_report";

export type ItemState = "pending" | "active" | "done";

export const CHECKLIST_ORDER: ChecklistItemKey[] = [
  "speech_quality",
  "grammar",
  "vocabulary",
  "pronunciation",
  "final_report",
];

export const CHECKLIST_LABELS: Record<ChecklistItemKey, string> = {
  speech_quality: "Speech quality",
  grammar: "Grammar",
  vocabulary: "Vocabulary",
  pronunciation: "Pronunciation",
  final_report: "Final report",
};

/** Align post-loading pronunciation poll with CallFeedbackScreen (Spec §8.2). */
export const MAX_PRON_POLLS = 8;
export const PRON_POLL_INTERVAL_MS = 5000;

/** Spec §5.3 — read score by key or `${key}_score` alias. */
export function scoreValue(
  scores: Record<string, unknown> | null | undefined,
  key: string,
): number {
  if (!scores || typeof scores !== "object") return 0;
  const direct = Number(scores[key] ?? scores[`${key}_score`] ?? 0);
  return Number.isFinite(direct) ? direct : 0;
}

/**
 * Spec §5.3 — real overall score (not placeholder).
 * `source === "cqs"` counts as real; excludes ≤0 and the 48–52 sentinel band.
 */
export function hasRealOverall(
  scores: Record<string, unknown> | null | undefined,
): boolean {
  if (!scores || typeof scores !== "object") return false;
  if (scores.source === "cqs") return true;
  const overall = scoreValue(scores, "overall");
  if (overall <= 0) return false;
  if (overall >= 48 && overall <= 52) return false;
  return true;
}

/** Spec §5.3 — pronunciation sentinel used while Azure PA is still processing. */
export function isPronunciationSentinel(
  scores: Record<string, unknown> | null | undefined,
): boolean {
  return scoreValue(scores, "pronunciation") === 50;
}

/**
 * Spec §4.1 — partner still needs to end the call before analysis can finish.
 */
export function detectWaitingForPartner(
  session: Pick<ConversationSession, "participants" | "feedbacks"> | null | undefined,
): boolean {
  if (!session) return false;
  const participantCount = session.participants?.length ?? 0;
  const feedbackCount = session.feedbacks?.length ?? 0;
  return participantCount > 0 && feedbackCount < participantCount;
}

/**
 * Defensively detect vocabulary examples in common analysis payload shapes.
 * Never throws on unexpected / partial data.
 */
function hasVocabularyExamples(analysis: unknown): boolean {
  if (!analysis || typeof analysis !== "object") return false;
  const a = analysis as Record<string, unknown>;

  const checkVocabBlock = (block: unknown): boolean => {
    if (!block || typeof block !== "object") return false;
    const vocab = (block as Record<string, unknown>).vocabulary;
    if (!vocab || typeof vocab !== "object") return false;
    const examples = (vocab as Record<string, unknown>).examples;
    return Array.isArray(examples) && examples.length > 0;
  };

  try {
    const rawData = a.rawData;
    if (rawData && typeof rawData === "object") {
      const raw = rawData as Record<string, unknown>;
      if (checkVocabBlock(raw.ai_detailed_feedback)) return true;
      if (checkVocabBlock(raw.aiDetailedFeedback)) return true;
      // Sometimes vocabulary examples hang off rawData directly
      if (checkVocabBlock(raw)) return true;
      const nestedExamples = raw.vocabulary_examples ?? raw.vocabularyExamples;
      if (Array.isArray(nestedExamples) && nestedExamples.length > 0) return true;
    }

    if (checkVocabBlock(a.ai_detailed_feedback)) return true;
    if (checkVocabBlock(a.aiDetailedFeedback)) return true;
  } catch {
    return false;
  }

  return false;
}

export type IsDoneSignalsOptions = {
  /** Parallel CQS fetch succeeded (optional boost for speech_quality). */
  hasCqs?: boolean;
  /** Loading exit criteria met — screen about to leave loading (Spec §6). */
  aboutToExitLoading?: boolean;
};

/**
 * Spec §5.3 — which checklist items are satisfied by current session analysis.
 */
export function isDoneSignals(
  session: ConversationSession | null | undefined,
  options: IsDoneSignalsOptions = {},
): Record<ChecklistItemKey, boolean> {
  const analysis = session?.analyses?.[0];
  const scores = (analysis?.scores ?? {}) as Record<string, unknown>;
  const hasCqs = options.hasCqs === true;
  const aboutToExitLoading = options.aboutToExitLoading === true;

  const mistakesLen = Array.isArray(analysis?.mistakes)
    ? analysis!.mistakes.length
    : 0;
  const pronIssuesLen = Array.isArray(analysis?.pronunciationIssues)
    ? analysis!.pronunciationIssues.length
    : 0;

  const pronunciationScore = scoreValue(scores, "pronunciation");
  const pronunciationDone =
    pronIssuesLen > 0 ||
    (pronunciationScore > 0 && !isPronunciationSentinel(scores));

  return {
    speech_quality:
      hasRealOverall(scores) || scoreValue(scores, "fluency") > 0 || hasCqs,
    grammar: scoreValue(scores, "grammar") > 0 || mistakesLen > 0,
    vocabulary:
      scoreValue(scores, "vocabulary") > 0 || hasVocabularyExamples(analysis),
    pronunciation: pronunciationDone,
    final_report: aboutToExitLoading,
  };
}

/**
 * Spec §5.2 Active rule (locked for out-of-order completion):
 * - No first poll → all pending
 * - Done items → done
 * - Gap fill: pending with index ≤ highestDoneIndex → active
 * - Frontier: first index after the contiguous done-from-start prefix → active
 *   (covers {1,2}→#3 and none→#1; does not activate past gaps beyond highest done)
 */
export function deriveChecklistStates(
  done: Record<ChecklistItemKey, boolean>,
  options: { hasFirstPoll: boolean },
): Record<ChecklistItemKey, ItemState> {
  const result = {} as Record<ChecklistItemKey, ItemState>;

  if (!options.hasFirstPoll) {
    for (const key of CHECKLIST_ORDER) {
      result[key] = "pending";
    }
    return result;
  }

  let highestDone = -1;
  let contiguousEnd = -1;
  for (let i = 0; i < CHECKLIST_ORDER.length; i++) {
    const key = CHECKLIST_ORDER[i];
    if (done[key]) {
      highestDone = i;
      if (contiguousEnd === i - 1) {
        contiguousEnd = i;
      }
    }
  }

  const frontier = contiguousEnd + 1;

  for (let i = 0; i < CHECKLIST_ORDER.length; i++) {
    const key = CHECKLIST_ORDER[i];
    if (done[key]) {
      result[key] = "done";
    } else if (i <= highestDone || i === frontier) {
      result[key] = "active";
    } else {
      result[key] = "pending";
    }
  }

  return result;
}
