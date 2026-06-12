/**
 * Home screen design tokens — peer-first dark redesign (2026-06-12).
 * Single source of truth for the home visual language. Every home component
 * imports from here, the same pattern as chat/theme/chatTheme.ts.
 *
 * Canvas + purple accent converge with the chat thread so the app reads as
 * one dark identity.
 */
export const homeTheme = {
  // Canvas — matches chatThreadTheme.canvas
  canvas: "#0A0A0F",

  // Base card surface (used by every card except the hero)
  cardFill: "#16161E",
  cardBorder: "rgba(255,255,255,0.06)",
  cardRadius: 20,
  cardPadding: 16,

  // Hero card — only one per screen gets the animated gradient border
  heroGradient: ["#6D28D9", "#EC4899"] as const, // purple → pink
  heroBorderWidth: 1.5,
  heroRotationMs: 8000,

  // Text scale — three levels only
  textDisplay: "#FFFFFF", // greeting, score number (bold 28/34)
  textTitle: "#F4F4F5", // card title (17 semibold)
  textBody: "#9CA3AF", // body/meta (13–14)
  textMuted: "#6B7280",

  // Accents — strictly scoped
  action: "#6D28D9", // CTAs, interactive purple
  live: "#22C55E", // online dot, positive deltas
  streak: "#F59E0B", // flame only
  streakUnlit: "#3F3F46", // streak 0 state

  // Typography
  fontDisplay: 28,
  fontDisplayLine: 34,
  fontTitle: 17,
  fontBody: 14,
  fontMeta: 13,

  // Choreography (ms) — entry sequence, once per cold land
  entry: {
    greeting: { delay: 0, duration: 250 },
    cascadeStagger: 90, // between hero → mistakes → score → carousel
    cascadeStart: 150,
    cascadeDuration: 520,
    ringSweepStart: 600,
    avatarStart: 900,
    avatarStagger: 80,
    streakIgnite: 1300,
    streakIgniteDuration: 300,
  },

  // Press feedback
  pressScale: 0.97,
} as const;

export type HomeTheme = typeof homeTheme;
