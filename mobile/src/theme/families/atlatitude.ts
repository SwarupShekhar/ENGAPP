import { Theme } from "../types";
import { baseTheme } from "../base";

export const atlatitudeLight: Theme = {
  ...baseTheme,
  id: "atlatitude-light",
  name: "Atlatitude Light",
  family: "purpleDream", // Reusing family for categorization if needed
  variation: "light",
  colors: {
    primary: "#977DFF",
    secondary: "#FFCCF2",
    accent: "#F2E6EE",
    deep: "#0033FF",
    background: "#F8F7FF",
    surface: "#FFFFFF",
    text: {
      primary: "#0033FF",
      secondary: "#64748B",
      light: "#94A3B8",
      accent: "#977DFF",
    },
    error: "#F43F5E",
    success: "#10B981",
    warning: "#F59E0B",
    border: "#E2E8F0",
    skill: {
      grammar: baseTheme.tokens.skill.grammar,
      pronunciation: baseTheme.tokens.skill.pronunciation,
      fluency: baseTheme.tokens.skill.fluency,
      vocabulary: baseTheme.tokens.skill.vocabulary,
    },
  },
  gradients: {
    primary: ["#F2E6EE", "#FFCCF2", "#977DFF", "#0033FF"],
    secondary: ["#977DFF", "#0033FF"],
    surface: ["#F8F7FF", "#FFFFFF"],
    premium: ["#0033FF", "#0600AB", "#00033D"],
    card: ["#FFFFFF", "#F1F5F9"],
  },
  shadows: {
    ...baseTheme.shadows,
  },
};

export const atlatitudeStandard: Theme = {
  ...baseTheme,
  id: "atlatitude-standard",
  name: "Atlatitude",
  family: "purpleDream",
  variation: "standard",
  colors: {
    primary: "#0033FF",
    secondary: "#977DFF",
    accent: "#FFCCF2",
    deep: "#00033D",
    background: "#F0F2F8",
    surface: "#FFFFFF",
    text: {
      primary: "#0F172A",
      secondary: "#64748B",
      light: "#94A3B8",
      accent: "#0033FF",
    },
    error: "#F43F5E",
    success: "#10B981",
    warning: "#F59E0B",
    border: "#334155",
    skill: {
      grammar: baseTheme.tokens.skill.grammar,
      pronunciation: baseTheme.tokens.skill.pronunciation,
      fluency: baseTheme.tokens.skill.fluency,
      vocabulary: baseTheme.tokens.skill.vocabulary,
    },
  },
  gradients: {
    primary: ["#FFCCF2", "#977DFF", "#0033FF", "#0600AB"],
    secondary: ["#977DFF", "#0033FF"],
    surface: ["#0033FF", "#0600AB"],
    premium: ["#977DFF", "#0033FF", "#0600AB", "#00033D"],
    card: ["#FFFFFF", "#F8FAFC"],
  },
  shadows: {
    ...baseTheme.shadows,
    xl: {
      ...baseTheme.shadows.xl,
      shadowColor: "#0033FF",
    },
  },
};
