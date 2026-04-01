import { Theme } from "../types";
import { baseTheme } from "../base";

export const englivoStandard: Theme = {
  ...baseTheme,
  id: "englivo-standard",
  name: "Englivo",
  family: "englivo",
  variation: "standard",
  colors: {
    primary: "#F59E0B",
    secondary: "#D97706",
    accent: "#F59E0B",
    deep: "#78350F",
    background: "#0F172A",
    surface: "#1E293B",
    text: {
      primary: "#F8FAFC",
      secondary: "#FDE68A",
      light: "#94A3B8",
      accent: "#F59E0B",
    },
    error: "#F87171",
    success: "#34D399",
    warning: "#FBBF24",
    border: "#334155",
    skill: {
      grammar: baseTheme.tokens.skill.grammar,
      pronunciation: baseTheme.tokens.skill.pronunciation,
      fluency: baseTheme.tokens.skill.fluency,
      vocabulary: baseTheme.tokens.skill.vocabulary,
    },
  },
  gradients: {
    primary: ["#F59E0B", "#D97706"],
    secondary: ["#D97706", "#B45309"],
    surface: ["#1E293B", "#0F172A"],
    premium: ["#F59E0B", "#FBBF24"],
    card: ["#1E293B", "#334155"],
  },
  shadows: {
    ...baseTheme.shadows,
    xl: {
      ...baseTheme.shadows.xl,
      shadowColor: "#F59E0B",
    },
  },
};
