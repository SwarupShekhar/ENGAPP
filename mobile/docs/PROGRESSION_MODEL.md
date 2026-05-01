# EngR Scoring & Progression Model

This document outlines the current scoring mechanism, progression factors, and the user journey within the EngR platform.

## 1. The Scoring Pillars (The 1000-Point Scale)

The "Overall Score" seen on the Home Screen is a weighted average of five primary English language components. While the total scale is represented as 1000 in the UI for a "premium" feel, the underlying engine calculates it on a 0-100 scale (multiplied by 10 for display).

### Component Weights
| Skill | Weight | Description |
| :--- | :--- | :--- |
| **Fluency** | **27%** | Speed of speech (WPM), hesitation markers, and pause frequency. |
| **Grammar** | **22%** | Tense control, article usage, and sentence complexity. |
| **Pronunciation** | **18%** | Phoneme accuracy, word stress, and connected speech. |
| **Vocabulary** | **18%** | Lexical range, sophistication, and precision. |
| **Comprehension** | **15%** | Ability to understand questions and provide relevant, deep responses. |

---

## 2. Leveling & CEFR Mapping

Users progress through CEFR (Common European Framework of Reference for Languages) levels based on their overall score.

| Level | Score Range (0-100) | UI Score (0-1000) | Description |
| :--- | :--- | :--- | :--- |
| **C2** | > 90 | 900+ | Mastery / Proficient |
| **C1** | 82 - 90 | 820 - 900 | Advanced |
| **B2** | 72 - 82 | 720 - 820 | Upper Intermediate |
| **B1** | 55 - 72 | 550 - 720 | Intermediate |
| **A2** | 35 - 55 | 350 - 550 | Elementary |
| **A1** | 0 - 35 | 0 - 350 | Beginner |

---

## 3. The "Kill Switch" (Gating Rules)

To ensure a balanced skill set, EngR employs **Gating Rules**. If a single core skill is significantly weak, it acts as a "ceiling" for the overall score, regardless of how good other skills are.

*   **The Pronunciation Gate**: If Pronunciation < 35, the user is capped at **A1** (max score 37).
*   **The Fluency Gate**: If Fluency < 30, the user is capped at **A1** (max score 37).
*   **The Grammar Gate**: If Grammar < 35, the user is capped at **A2** (max score 44).
*   **The Balanced Growth Rule**: If 3 or more components are below 50, the user is capped at **B1**.

---

## 4. User Journey & Progress

### Phase A: Initial Calibration (Assessment)
A new user goes through a 4-phase adaptive assessment:
1.  **Phase 1**: Initial baseline (Reading a simple sentence).
2.  **Phase 2**: Pronunciation & Fluency (Adaptive difficulty sentences).
3.  **Phase 3**: Grammar & Vocabulary (Image description).
4.  **Phase 4**: Comprehension (Open-ended question).

### Phase B: Gradual Practice
Progress is updated session-by-session:
*   **P2P Calls**: Real-world practice. Scores are updated based on an AI analysis of the entire conversation.
*   **AI Tutor Calls**: Safe environment to practice specific topics. These sessions provide consistent, high-granularity feedback.
*   **XP & Leveling**: Every session awards **XP** (Base 50 XP + consistency bonuses). XP controls the "Experience Level" (Level 1, 2, 3...), while "Skill Scores" control the CEFR progression.

### Phase C: Review & Re-Calibration
Users can see their "Deltas" (improvement since last session) on the Home Screen. Every 7 days (optional), users are encouraged to take a full Assessment to "re-calibrate" their official CEFR standing.

---

## 5. How to Increase the Score?

| To improve... | Focus on... |
| :--- | :--- |
| **Fluency** | Reducing filler words ("um", "like") and maintaining a speech rate > 100 WPM. |
| **Pronunciation** | Mastering phoneme accuracy and minimizing "American/British" accent deviations. |
| **Vocabulary** | Using complex synonyms and topic-specific terminology during calls. |
| **Comprehension** | Providing longer, more detailed answers rather than "Yes/No" responses. |
| **Grammar** | Using past/future tenses correctly and forming compound sentences. |
