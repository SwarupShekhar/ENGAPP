# English Level & Progress Scoring Logic — Detailed Report

This document describes how a user gets their English level from the initial assessment, how P2P calls and AI tutor sessions interact with the system, and how the Progress screen displays scores.

---

## 1. How the User Gets Their Level (Initial Assessment Only)

**The CEFR level and numeric score shown as “English Mastery” on the Progress screen are set only when the user completes an Assessment.** P2P and AI tutor sessions do **not** update this level or the overall score.

### 1.1 Assessment flow (4 phases)

The assessment is a single multi-phase session. Each phase produces data that is stored on `AssessmentSession` and later used in `calculateFinalLevel`.

| Phase | What it measures | Source of scores |
|-------|------------------|------------------|
| **Phase 1** | Warm-up read-aloud (“I like to eat breakfast at home.”) | Azure Speech: `accuracyScore`, `fluencyScore`, `prosodyScore`, `wordCount`. Used for quality checks (SNR, word count); scores are not directly used in final level. |
| **Phase 2** | Pronunciation & fluency (2 attempts, adaptive sentences) | Azure Speech + Nest logic: `accuracyScore` (pronunciation), `fluencyScore` (with enhanced fluency: WPM, pauses, fillers). **Final** = average of attempt 1 and attempt 2. |
| **Phase 3** | Grammar, vocabulary, image description | Backend (Brain/Gemini): `grammarScore`, `grammarBreakdown`, `vocabularyCEFR`, `vocabBreakdown`, `talkStyle`. Image level is adaptive from Phase 2 pronunciation. |
| **Phase 4** | Comprehension (open response) | Nest + Brain: `comprehensionScore` from word count bands + AI quality score, with repetition penalty. |

### 1.2 Component scores used for final level

In `calculateFinalLevel`, the following are read from the stored phase data:

- **Pronunciation** (`pron`): `phase2Data.finalPronunciationScore` (average of 2 attempts).
- **Fluency** (`flu`): `phase2Data.finalFluencyScore` (average of 2 attempts, after enhanced fluency calculation).
- **Grammar** (`grammar`): `phase3Data.grammarScore`.
- **Vocabulary** (`vocabScore`): Mapped from `phase3Data.vocabularyCEFR` via a fixed CEFR→score map (see below).
- **Comprehension** (`comp`): `phase4Data.comprehensionScore`.

Vocabulary CEFR→score map (assessment):

- `A1` → 10, `A2` → 30, `B1` → 50, `B2` → 70, `C1` → 85, `C2` → 95.

### 1.3 Component weights (weighted sum)

Raw overall score is a weighted sum (0–100 scale):

| Component    | Weight |
|-------------|--------|
| Pronunciation | 18%  |
| Fluency      | 27%  |
| Grammar      | 22%  |
| Vocabulary   | 18%  |
| Comprehension| 15%  |

Formula:

```text
rawScore = pron×0.18 + flu×0.27 + grammar×0.22 + vocabScore×0.18 + comp×0.15
```

### 1.4 Gating (caps on overall score)

The raw score is then capped by three gating steps (order matters):

1. **Pronunciation gating**  
   - pron &lt; 35 → overall capped at 37 (max A1).  
   - pron &lt; 45 → cap 54 (max A2).  
   - pron &lt; 55 → cap 71 (max B1).  
   - pron &lt; 70 → cap 89 (max C1).  
   - Otherwise no cap.

2. **Fluency gating**  
   - flu &lt; 30 → cap 37.  
   - flu &lt; 40 → cap 54.  
   - flu &lt; 50 → cap 71.  
   - flu &lt; 65 → cap 81 (max B2).  
   - Otherwise no cap.

3. **Multi-factor gating**  
   - If pron &lt; 45 **and** flu &lt; 45 → cap 44.  
   - If grammar &lt; 35 → cap 44.  
   - If 3+ components &lt; 50 → cap 60.  
   - If pron, flu, grammar all &lt; 60 → cap 71.

The final **overall score** is the result after all caps, rounded to an integer.

### 1.5 Score → CEFR level (assessment)

After gating, the overall score is mapped to CEFR:

| Overall score (after gating) | CEFR level |
|------------------------------|------------|
| ≤ 35                         | A1        |
| 36–55                        | A2        |
| 56–72                        | B1        |
| 73–82                        | B2        |
| 83–90                        | C1        |
| &gt; 90                      | C2        |

### 1.6 What gets persisted

When the assessment completes (`calculateFinalLevel`):

- **AssessmentSession**: `status: COMPLETED`, `overallLevel`, `overallScore`, `skillBreakdown`, `weaknessMap`, `improvementDelta`, `personalizedPlan`, `benchmarking`, `readiness`, etc.
- **User**:  
  - `overallLevel` = assessment CEFR  
  - `assessmentScore` = assessment overall score  
  - `talkStyle`, `levelUpdatedAt`

So the “level” and “score” the user sees app-wide (Home, Progress, etc.) are exactly the **last completed assessment’s** level and score. **`initialAssessmentScore`** is present on `User` and used on the home screen for “score delta from start” and in achievements; it is not set in the assessment flow in the current codebase (may be set elsewhere or left at default).

---

## 2. P2P Calls — How They Affect the System

- **Session flow**: User joins a P2P call; when the call ends, the session is marked completed and a **queue job** runs to process the session (transcription, joint analysis).
- **Analysis**: The AI pipeline produces an **Analysis** per participant with `scores` (e.g. `fluency`, `grammar`, `vocabulary`, `pronunciation`). These are stored on the **Analysis** model linked to **SessionParticipant** / **ConversationSession**.
- **Session handler**: When the processor finishes, it calls `SessionHandlerService.handleSessionComplete(userId, { type: 'p2p', durationSeconds, skills })` with those scores. The handler:
  - Increments **totalSessions**
  - Updates **lastSessionAt** and **currentStreak** (streak logic)
  - Checks and awards **achievements** (streaks, session counts, P2P counts, score improvement vs `initialAssessmentScore`)
  - Invalidates user caches  
  It does **not** update `User.assessmentScore` or `User.overallLevel`.

So: **P2P calls do not change the user’s English level or the numeric “English Mastery” score.** They only affect:

- Total sessions and weekly activity (e.g. Progress “weekly activity”).
- Streak.
- Achievements (badges).
- Reliability/tier (separate from CEFR).

---

## 3. AI Tutor (Maya) Sessions — How They Affect the System

- **Session flow**: User has a conversation with the AI tutor; at **endSession**, the app calls the backend to end the session and run final analysis.
- **Analysis**: The backend (e.g. conversational-tutor service) builds a transcript, runs **generateFinalRecap** (Gemini), and creates an **Analysis** with `scores`, `cefrLevel`, `rawData` (feedback, strengths, weaknesses), plus **Mistake** and **PronunciationIssue** records.
- **eBites**: Weaknesses and pronunciation issues from that analysis are sent to **WeaknessService.ingestFromSessionAnalysis** so that the eBites feed can prioritize reels that target those weaknesses.
- **User record**: The AI tutor flow does **not** update `User.assessmentScore` or `User.overallLevel`.

So: **AI tutor sessions do not change the user’s CEFR level or the Progress “English Mastery” score.** They affect:

- Stored **Analysis** (and mistakes/pronunciation issues) for that session.
- **eBites personalization** (weakness tags for reel recommendations).
- If the same session completion path eventually calls the same session-handler logic (e.g. for streaks/session count), they would also affect total sessions and streaks; the codebase’s AI tutor path does not show a direct call to `handleSessionComplete` in the snippet reviewed, but any such call would still not update level/score.

---

## 4. Progress Screen — What It Shows and Where It Gets Data

The Progress screen displays “English Mastery” (overall score + CEFR), detailed skill scores, deltas, weekly activity, weaknesses, streak, and total sessions.

### 4.1 API and service

- The mobile app calls the **progress** API (e.g. `GET /progress/metrics` or similar), which uses **ProgressService.getDetailedMetrics(userId)**.

### 4.2 Data source for scores and level

- **Current scores and level** come only from the **latest completed AssessmentSession** for that user (by `completedAt` desc).
- **Deltas** (e.g. “+5 from last time”) are computed by comparing that latest assessment to the **previous** completed assessment (again by `completedAt`).
- No P2P or AI tutor **Analysis** records are used for the numeric scores or CEFR on this screen.

So:

- **current.overallScore** = `currentAssessment.overallScore`
- **current.cefrLevel** = `currentAssessment.overallLevel`
- **current.** (pronunciation, fluency, grammar, vocabulary, comprehension) = derived from **currentAssessment.skillBreakdown** (with a flattening helper that picks a primary metric per skill, e.g. `phonemeAccuracy`, `speechRate`, `tenseControl`, `lexicalRange`).
- **deltas** = current assessment minus previous assessment (same breakdown + overall score).
- **weaknesses** = from **currentAssessment.weaknessMap** (top 3).
- **weeklyActivity** = count of **SessionParticipant** rows for that user where the related **ConversationSession** is completed and started in the last 7 days (P2P/tutor sessions count here).
- **streak** = from **Profile** (or User) streak.
- **totalSessions** = from **UserReliability** (or similar) total sessions.

So: **Progress “English Mastery” and “Detailed Scores” are 100% assessment-driven.** P2P and AI tutor only influence **activity counts**, **streak**, and (for tutor) **eBites** personalization, not the level/score numbers.

---

## 5. Summary Table

| Source                    | Updates user level / assessmentScore? | Updates Progress “English Mastery” / detailed scores? | What it does update / affect |
|---------------------------|----------------------------------------|--------------------------------------------------------|-----------------------------|
| **Initial / repeat assessment** | Yes (`overallLevel`, `assessmentScore`) | Yes (Progress reads from latest assessment)            | AssessmentSession, User level/score, weaknessMap, benchmarking, readiness |
| **P2P call**             | No                                     | No                                                     | Analysis per participant, totalSessions, streak, achievements, reliability |
| **AI tutor (Maya)**      | No                                     | No                                                     | Analysis, mistakes, pronunciation issues, eBites weakness ingestion |

---

## 6. Files of interest (for implementation reference)

- **Assessment (level & score calculation)**  
  - `backend-nest/src/modules/assessment/assessment.service.ts`  
  - `calculateFinalLevel`, `applyPronunciationGating`, `applyFluencyGating`, `applyMultiFactorGating`, component weights, Phase 2/3/4 handlers.
- **Progress screen data**  
  - `backend-nest/src/modules/progress/progress.service.ts`  
  - `getDetailedMetrics`, `flattenSkills`, `getWeeklyActivity`.
- **P2P session completion**  
  - `backend-nest/src/modules/sessions/sessions.processor.ts`  
  - `handleProcessSession` → analysis + `SessionHandlerService.handleSessionComplete`.
- **Session handler (no level update)**  
  - `backend-nest/src/modules/home/services/session-handler.service.ts`  
  - `handleSessionComplete` (streak, totalSessions, achievements, cache invalidation).
- **AI tutor end session**  
  - `backend-nest/src/modules/conversational-tutor/conversational-tutor.service.ts`  
  - `endSession` → Analysis, mistakes, pronunciation issues, weakness ingest.
- **Home header (score/level display)**  
  - `backend-nest/src/modules/home/builders/header.builder.ts`  
  - Uses `user.assessmentScore` / `user.overallLevel` with fallback to latest completed assessment.

---

## 7. Optional: Making P2P / AI tutor “contribute” to the displayed score

Currently they do not. If product wants the Progress “English Mastery” to reflect practice (P2P + tutor) as well as assessments, you would need to:

- Define a **rolling score** (e.g. blend of latest assessment + recent session analyses), or
- Periodically run a **re-assessment** or “light assessment” and use that to update level/score, or
- Store a **separate “practice score”** and show both “Assessment level” and “Practice level” on Progress.

All of that would require new logic and possibly schema changes; the current design keeps level and Progress score strictly assessment-based.
