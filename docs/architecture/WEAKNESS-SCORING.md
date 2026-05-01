# EngR — Weakness scoring, decay, and feed relevance

**Goal:** Precisely define how the app converts user behavior (calls, tutor, reel activities) into a per-topic “weakness” signal that powers the eBites feed ranking.

**Sources (verified):**
- `backend-nest/src/modules/reels/weakness.service.ts`
- `backend-nest/src/database/prisma/schema.prisma` (`UserTopicScore`)
- `backend-nest/src/modules/reels/reels.service.ts` (uses `WeaknessService.getTopWeaknesses`)

---

## 1. Storage model (`UserTopicScore`)

Each user has up to one row per `topicTag`:

- **Key**: `(userId, topicTag)` unique
- **Core fields**
  - `score` (float, default 50.0): “raw” weakness score \(0..100\)
  - `decayRate` (float, default 0.95): per-day multiplicative decay factor
  - `lastSeenAt` (timestamp): last time we ingested a signal for this topic
  - `occurrences` (int): how many times we’ve ingested a signal for this topic
  - `source` (string): last source of ingestion (`activity | session | assessment`)

---

## 2. Score update rules (ingestion)

### 2.1 Single-signal ingestion

`WeaknessService.ingestWeakness(userId, topicTag, source, scoreChange)`

If row exists:

- \(score' = clamp_{[0,100]}(score + scoreChange)\)
- `occurrences += 1`
- `lastSeenAt = now()`
- `source = latest source`

If row does not exist:

- Create with \(score = clamp_{[0,100]}(50 + scoreChange)\)
- `occurrences = 1`
- `lastSeenAt = now()`

### 2.2 Batch ingestion from session analysis

`WeaknessService.ingestFromSessionAnalysis(userId, mistakes, pronunciationIssues)`

- Grammar tags: `mistakes[].type` normalized into `topicTag`
  - Count occurrences by type
  - Delta per type: \( \Delta = min(20, 5 \times count)\)
- Pronunciation tags: `pronunciationIssues[].issueType` normalized into `topicTag`
  - Same delta rule

All deltas are applied through `ingestWeakness(..., source='session', scoreChange=Δ)`.

### 2.3 Tag normalization

`normalizeTag(raw)`:

- lowercase + trim
- replace underscores/whitespace with `-`
- remove non `[a-z0-9-]`

Examples:

- `"Verb Form"` → `verb-form`
- `"article_usage"` → `article-usage`

---

## 3. Time-decay math (effective score)

When retrieving top weaknesses:

`WeaknessService.getTopWeaknesses(userId, limit)`

For each `UserTopicScore` row \(w\):

1. Days since last seen:

\[
d = \max\left(0, \frac{now - lastSeenAt}{86400\ \text{seconds}}\right)
\]

2. Decayed score:

\[
score_{decayed} = score \cdot decayRate^{d}
\]

3. Occurrence boost:

\[
boost = \min(1.5,\ 1 + 0.05 \cdot occurrences)
\]

4. Effective score:

\[
score_{effective} = score_{decayed} \cdot boost
\]

### 3.1 Filtering / ranking behavior

- **Ignore near-zero**: rows with `effectiveScore <= 10` are filtered out.
- **Return top N**: after filtering, rows are sorted by `effectiveScore DESC` and the top `limit` are returned.
- **Fetch extra**: the implementation fetches `limit * 2` by raw `score DESC` before decay, to avoid missing decayed-but-still-relevant rows.

---

## 4. How this affects the reels feed

`ReelsService.getFeed(userId)` calls `getTopWeaknesses(userId, 10)` and builds:

- `weakTags = weaknesses.map(w => w.topicTag)`
- `weaknessMap = Map(topicTag -> effectiveScore)`

Then Strapi reels are fetched in three buckets and scored; weakness matching is the primary ranking signal for the “weakness” bucket.

> The exact reel relevance formula lives in `ReelsService.calculateRelevanceScore(...)`; document it alongside Strapi tag conventions when you finalize the CMS contract.

