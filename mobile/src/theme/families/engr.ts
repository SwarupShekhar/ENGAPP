import { Theme } from "../types";
import { baseTheme } from "../base";

const skillTokens = {
  grammar: "#818CF8",
  grammarTint: "rgba(129, 140, 248, 0.18)",
  pronunciation: "#A78BFA",
  pronunciationTint: "rgba(167, 139, 250, 0.18)",
  fluency: "#6EE7B7",
  fluencyTint: "rgba(110, 231, 183, 0.18)",
  vocabulary: "#FCA5A5",
  vocabularyTint: "rgba(252, 165, 165, 0.18)",
};

export const engrStandard: Theme = {
  ...baseTheme,
  id: "engr-standard",
  name: "EngR",
  family: "engr",
  variation: "standard",
  tokens: {
    ...baseTheme.tokens,
    skill: skillTokens,
  },
  colors: {
    primary: "#818CF8",
    secondary: "#6366F1",
    accent: "#A5B4FC",
    deep: "#312E81",
    background: "#0F0F1A",
    surface: "#1A1A2E",
    text: {
      primary: "#F8FAFC",
      secondary: "#C7D2FE",
      light: "#94A3B8",
      accent: "#A5B4FC",
    },
    error: "#F87171",
    success: "#34D399",
    warning: "#FBBF24",
    border: "#2D2B50",
    skill: {
      grammar: "#818CF8",
      pronunciation: "#A78BFA",
      fluency: "#6EE7B7",
      vocabulary: "#FCA5A5",
    },
  },
  gradients: {
    primary: ["#818CF8", "#6366F1"],
    secondary: ["#6366F1", "#4F46E5"],
    surface: ["#1A1A2E", "#0F0F1A"],
    premium: ["#818CF8", "#A78BFA"],
    card: ["#1A1A2E", "#252547"],
  },
  shadows: {
    ...baseTheme.shadows,
    xl: {
      ...baseTheme.shadows.xl,
      shadowColor: "#818CF8",
    },
  },
};
