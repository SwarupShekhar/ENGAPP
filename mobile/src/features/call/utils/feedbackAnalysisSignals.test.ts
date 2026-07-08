import type { ConversationSession, SessionAnalysis } from "../../../api/sessions";
import {
  CHECKLIST_ORDER,
  deriveChecklistStates,
  detectWaitingForPartner,
  hasRealOverall,
  isDoneSignals,
  isPronunciationSentinel,
  scoreValue,
  type ChecklistItemKey,
} from "./feedbackAnalysisSignals";

function sessionFixture(options?: {
  scores?: Record<string, unknown>;
  mistakes?: SessionAnalysis["mistakes"];
  pronunciationIssues?: SessionAnalysis["pronunciationIssues"];
  rawData?: SessionAnalysis["rawData"] & Record<string, unknown>;
  participants?: ConversationSession["participants"];
  feedbacks?: ConversationSession["feedbacks"];
}): ConversationSession {
  const scores = {
    grammar: 0,
    pronunciation: 0,
    fluency: 0,
    vocabulary: 0,
    overall: 0,
    ...(options?.scores ?? {}),
  } as SessionAnalysis["scores"];

  const analysis: SessionAnalysis = {
    id: "a1",
    cefrLevel: "B1",
    scores,
    mistakes: options?.mistakes ?? [],
    pronunciationIssues: options?.pronunciationIssues ?? [],
    rawData: options?.rawData,
  };

  return {
    id: "sess-1",
    topic: null,
    status: "PROCESSING",
    startedAt: "2026-07-08T00:00:00.000Z",
    endedAt: null,
    duration: null,
    participants: options?.participants ?? [],
    feedbacks: options?.feedbacks ?? [],
    analyses: [analysis],
  };
}

describe("scoreValue", () => {
  it("reads direct key and _score alias", () => {
    expect(scoreValue({ grammar: 72 }, "grammar")).toBe(72);
    expect(scoreValue({ grammar_score: 65 }, "grammar")).toBe(65);
  });

  it("returns 0 for missing or non-finite", () => {
    expect(scoreValue({}, "grammar")).toBe(0);
    expect(scoreValue({ grammar: "x" }, "grammar")).toBe(0);
    expect(scoreValue(null, "grammar")).toBe(0);
  });
});

describe("hasRealOverall / isPronunciationSentinel", () => {
  it("treats source=cqs as real overall", () => {
    expect(hasRealOverall({ overall: 0, source: "cqs" })).toBe(true);
  });

  it("rejects 0 and 48–52 sentinel band", () => {
    expect(hasRealOverall({ overall: 0 })).toBe(false);
    expect(hasRealOverall({ overall: 50 })).toBe(false);
    expect(hasRealOverall({ overall: 48 })).toBe(false);
    expect(hasRealOverall({ overall: 52 })).toBe(false);
    expect(hasRealOverall({ overall: 70 })).toBe(true);
  });

  it("detects pronunciation sentinel at 50", () => {
    expect(isPronunciationSentinel({ pronunciation: 50 })).toBe(true);
    expect(isPronunciationSentinel({ pronunciation: 72 })).toBe(false);
  });
});

describe("detectWaitingForPartner", () => {
  it("is true when fewer feedbacks than participants", () => {
    expect(
      detectWaitingForPartner(
        sessionFixture({
          participants: [
            { id: "p1", userId: "u1", speakingTime: 0, turnsTaken: 0 },
            { id: "p2", userId: "u2", speakingTime: 0, turnsTaken: 0 },
          ],
          feedbacks: [{ participantId: "p1" }],
        }),
      ),
    ).toBe(true);
  });

  it("is false when all participants have feedback or no participants", () => {
    expect(
      detectWaitingForPartner(
        sessionFixture({
          participants: [
            { id: "p1", userId: "u1", speakingTime: 0, turnsTaken: 0 },
            { id: "p2", userId: "u2", speakingTime: 0, turnsTaken: 0 },
          ],
          feedbacks: [{}, {}],
        }),
      ),
    ).toBe(false);
    expect(detectWaitingForPartner(sessionFixture({ participants: [] }))).toBe(
      false,
    );
  });
});

describe("isDoneSignals", () => {
  it("marks speech_quality from real overall, fluency, or hasCqs", () => {
    expect(
      isDoneSignals(sessionFixture({ scores: { overall: 70 } })).speech_quality,
    ).toBe(true);
    expect(
      isDoneSignals(sessionFixture({ scores: { fluency: 40 } })).speech_quality,
    ).toBe(true);
    expect(
      isDoneSignals(sessionFixture({ scores: {} }), { hasCqs: true })
        .speech_quality,
    ).toBe(true);
    expect(
      isDoneSignals(sessionFixture({ scores: { overall: 50 } })).speech_quality,
    ).toBe(false);
  });

  it("marks grammar from score or mistakes", () => {
    expect(
      isDoneSignals(sessionFixture({ scores: { grammar: 55 } })).grammar,
    ).toBe(true);
    expect(
      isDoneSignals(
        sessionFixture({
          scores: { grammar: 0 },
          mistakes: [
            {
              id: "m1",
              type: "grammar",
              severity: "low",
              original: "a",
              corrected: "an",
              explanation: "article",
            },
          ],
        }),
      ).grammar,
    ).toBe(true);
  });

  it("marks vocabulary from score or vocab examples in rawData", () => {
    expect(
      isDoneSignals(sessionFixture({ scores: { vocabulary: 60 } })).vocabulary,
    ).toBe(true);
    expect(
      isDoneSignals(
        sessionFixture({
          scores: { vocabulary: 0 },
          rawData: {
            ai_detailed_feedback: {
              vocabulary: { examples: [{ text: "nuance" }] },
            },
          } as SessionAnalysis["rawData"] & Record<string, unknown>,
        }),
      ).vocabulary,
    ).toBe(true);
    expect(
      isDoneSignals(sessionFixture({ scores: { vocabulary: 0 } })).vocabulary,
    ).toBe(false);
  });

  it("does NOT mark pronunciation done for sentinel 50 alone", () => {
    expect(
      isDoneSignals(
        sessionFixture({
          scores: { pronunciation: 50 },
          pronunciationIssues: [],
        }),
      ).pronunciation,
    ).toBe(false);
  });

  it("marks pronunciation done for issues or non-sentinel score", () => {
    expect(
      isDoneSignals(
        sessionFixture({
          scores: { pronunciation: 50 },
          pronunciationIssues: [
            { id: "pi1", word: "people", severity: "med" },
          ],
        }),
      ).pronunciation,
    ).toBe(true);
    expect(
      isDoneSignals(sessionFixture({ scores: { pronunciation: 72 } }))
        .pronunciation,
    ).toBe(true);
  });

  it("marks final_report only when aboutToExitLoading", () => {
    expect(isDoneSignals(sessionFixture()).final_report).toBe(false);
    expect(
      isDoneSignals(sessionFixture(), { aboutToExitLoading: true }).final_report,
    ).toBe(true);
  });
});

describe("deriveChecklistStates", () => {
  const allFalse = (): Record<ChecklistItemKey, boolean> => ({
    speech_quality: false,
    grammar: false,
    vocabulary: false,
    pronunciation: false,
    final_report: false,
  });

  it("returns all pending when no first poll", () => {
    const done = allFalse();
    done.speech_quality = true;
    const states = deriveChecklistStates(done, { hasFirstPoll: false });
    for (const key of CHECKLIST_ORDER) {
      expect(states[key]).toBe("pending");
    }
  });

  it("activates #1 when nothing done after first poll", () => {
    const states = deriveChecklistStates(allFalse(), { hasFirstPoll: true });
    expect(states).toEqual({
      speech_quality: "active",
      grammar: "pending",
      vocabulary: "pending",
      pronunciation: "pending",
      final_report: "pending",
    });
  });

  it("advances frontier on sequential completion {1,2} → #3 active", () => {
    const done = allFalse();
    done.speech_quality = true;
    done.grammar = true;
    const states = deriveChecklistStates(done, { hasFirstPoll: true });
    expect(states).toEqual({
      speech_quality: "done",
      grammar: "done",
      vocabulary: "active",
      pronunciation: "pending",
      final_report: "pending",
    });
  });

  it("out-of-order: pronunciation before vocabulary → vocab active, pron done", () => {
    const done = allFalse();
    done.speech_quality = true;
    done.grammar = true;
    done.pronunciation = true;
    const states = deriveChecklistStates(done, { hasFirstPoll: true });
    expect(states).toEqual({
      speech_quality: "done",
      grammar: "done",
      vocabulary: "active",
      pronunciation: "done",
      final_report: "pending",
    });
  });

  it("activates final_report frontier when 1–4 done", () => {
    const done = allFalse();
    done.speech_quality = true;
    done.grammar = true;
    done.vocabulary = true;
    done.pronunciation = true;
    const states = deriveChecklistStates(done, { hasFirstPoll: true });
    expect(states.final_report).toBe("active");
    expect(states.pronunciation).toBe("done");
  });
});
