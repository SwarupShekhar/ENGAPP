/**
 * Curated pre-call conversation starters (PRD 4.2 — Fear 3: fear of being judged
 * in conversation). Three are picked at random per call, bucketed by a CEFR-ish
 * difficulty so learners see prompts they can actually attempt.
 */

export type StarterLevel = "easy" | "medium" | "hard";

export interface ConversationStarter {
  id: string;
  text: string;
  topic:
    | "daily-routine"
    | "work-college"
    | "food"
    | "movies-cricket"
    | "weekend-plans"
    | "hometown";
  level: StarterLevel;
}

export const CONVERSATION_STARTERS: ConversationStarter[] = [
  // ── Easy (A1–A2): short, present-tense, concrete ──
  { id: "e1", text: "What time do you wake up every day?", topic: "daily-routine", level: "easy" },
  { id: "e2", text: "What did you eat for breakfast today?", topic: "food", level: "easy" },
  { id: "e3", text: "Do you study or do you work?", topic: "work-college", level: "easy" },
  { id: "e4", text: "Which is your favourite movie?", topic: "movies-cricket", level: "easy" },
  { id: "e5", text: "Do you like cricket? Which team do you support?", topic: "movies-cricket", level: "easy" },
  { id: "e6", text: "What do you do on Sundays?", topic: "weekend-plans", level: "easy" },
  { id: "e7", text: "Which city are you from?", topic: "hometown", level: "easy" },
  { id: "e8", text: "What is your favourite food?", topic: "food", level: "easy" },
  { id: "e9", text: "Do you drink tea or coffee in the morning?", topic: "daily-routine", level: "easy" },
  { id: "e10", text: "What do you do after dinner every day?", topic: "daily-routine", level: "easy" },

  // ── Medium (B1): past/future, opinions, short stories ──
  { id: "m1", text: "Tell me about your typical day — what keeps you busiest?", topic: "daily-routine", level: "medium" },
  { id: "m2", text: "What do you enjoy most about your work or college?", topic: "work-college", level: "medium" },
  { id: "m3", text: "What's a dish from your home that everyone should try once?", topic: "food", level: "medium" },
  { id: "m4", text: "Which movie did you watch recently? Would you recommend it?", topic: "movies-cricket", level: "medium" },
  { id: "m5", text: "What was the most exciting cricket match you ever watched?", topic: "movies-cricket", level: "medium" },
  { id: "m6", text: "Any plans for the weekend? What are you looking forward to?", topic: "weekend-plans", level: "medium" },
  { id: "m7", text: "What is your hometown famous for?", topic: "hometown", level: "medium" },
  { id: "m8", text: "Do you prefer street food or home-cooked food? Why?", topic: "food", level: "medium" },
  { id: "m9", text: "How did you spend last weekend?", topic: "weekend-plans", level: "medium" },
  { id: "m10", text: "If you could change one thing about your daily routine, what would it be?", topic: "daily-routine", level: "medium" },

  // ── Hard (B2+): hypotheticals, comparisons, abstract opinions ──
  { id: "h1", text: "How has your daily routine changed over the last few years, and why?", topic: "daily-routine", level: "hard" },
  { id: "h2", text: "If you could switch careers tomorrow, what would you choose and what's stopping you?", topic: "work-college", level: "hard" },
  { id: "h3", text: "Some say college teaches less than the internet does today. Do you agree?", topic: "work-college", level: "hard" },
  { id: "h4", text: "Why do you think food is such a big part of Indian culture and identity?", topic: "food", level: "hard" },
  { id: "h5", text: "Do you think OTT platforms are killing the cinema-hall experience?", topic: "movies-cricket", level: "hard" },
  { id: "h6", text: "Is the IPL good or bad for Indian cricket in the long run? Defend your view.", topic: "movies-cricket", level: "hard" },
  { id: "h7", text: "If money were no object, how would you spend your ideal weekend?", topic: "weekend-plans", level: "hard" },
  { id: "h8", text: "Would you move back to your hometown if you could work from anywhere? Why or why not?", topic: "hometown", level: "hard" },
  { id: "h9", text: "How would you describe your hometown to someone who has never visited India?", topic: "hometown", level: "hard" },
  { id: "h10", text: "Do weekends actually help us recharge, or do we just fill them with more work?", topic: "weekend-plans", level: "hard" },
];

/** Map a CEFR level (A1..C2) onto a starter difficulty bucket. Unknown → medium. */
export function cefrToStarterLevel(cefr?: string | null): StarterLevel {
  switch ((cefr || "").trim().toUpperCase()) {
    case "A1":
    case "A2":
      return "easy";
    case "B1":
      return "medium";
    case "B2":
    case "C1":
    case "C2":
      return "hard";
    default:
      return "medium";
  }
}

/**
 * Pick `count` random starters for a call. Draws from the requested bucket first,
 * then pads from the full list if the bucket runs short.
 */
export function pickStarters(
  level: StarterLevel = "medium",
  count = 3,
): ConversationStarter[] {
  const shuffle = <T,>(arr: T[]): T[] => {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };

  const inLevel = shuffle(CONVERSATION_STARTERS.filter((s) => s.level === level));
  if (inLevel.length >= count) return inLevel.slice(0, count);

  const picked = new Set(inLevel.map((s) => s.id));
  const padding = shuffle(
    CONVERSATION_STARTERS.filter((s) => !picked.has(s.id)),
  ).slice(0, count - inLevel.length);
  return [...inLevel, ...padding];
}
