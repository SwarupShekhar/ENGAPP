import { Theme } from "../types";
import { baseTheme } from "../base";

export const aquasoft: Theme = {
  ...baseTheme,
  id: "ocean-light",
  name: "Aquasoft",
  family: "oceanDepth",
  variation: "light",
  colors: {
    primary: "#E0F7FA",
    secondary: "#80DEEA",
    accent: "#26C6DA",
    deep: "#00ACC1",
    background: "#F0FDFF",
    surface: "#FFFFFF",
    text: {
      primary: "#006064",
      secondary: "#546E7A",
      light: "#90A4AE",
      accent: "#00ACC1",
    },
    error: "#F43F5E",
    success: "#10B981",
    warning: "#F59E0B",
    border: "#B2EBF2",
    skill: {
      grammar: baseTheme.tokens.skill.grammar,
      pronunciation: baseTheme.tokens.skill.pronunciation,
      fluency: baseTheme.tokens.skill.fluency,
      vocabulary: baseTheme.tokens.skill.vocabulary,
    },
  },
  gradients: {
    primary: ["#E0F7FA", "#80DEEA"],
    secondary: ["#80DEEA", "#26C6DA"],
    surface: ["#F0FDFF", "#FFFFFF"],
    premium: ["#26C6DA", "#00ACC1"],
    card: ["#FFFFFF", "#E0F7FA"],
  },
  shadows: {
    ...baseTheme.shadows,
  },
};

export const oceanic: Theme = {
  ...baseTheme,
  id: "ocean-standard",
  name: "Oceanic",
  family: "oceanDepth",
  variation: "standard",
  colors: {
    primary: "#4FC3F7",
    secondary: "#29B6F6",
    accent: "#039BE5",
    deep: "#01579B",
    background: "#E1F5FE",
    surface: "#FFFFFF",
    text: {
      primary: "#01579B",
      secondary: "#455A64",
      light: "#90A4AE",
      accent: "#039BE5",
    },
    error: "#F43F5E",
    success: "#10B981",
    warning: "#F59E0B",
    border: "#B3E5FC",
    skill: {
      grammar: baseTheme.tokens.skill.grammar,
      pronunciation: baseTheme.tokens.skill.pronunciation,
      fluency: baseTheme.tokens.skill.fluency,
      vocabulary: baseTheme.tokens.skill.vocabulary,
    },
  },
  gradients: {
    primary: ["#4FC3F7", "#29B6F6"],
    secondary: ["#29B6F6", "#039BE5"],
    surface: ["#E1F5FE", "#FFFFFF"],
    premium: ["#039BE5", "#01579B"],
    card: ["#FFFFFF", "#E1F5FE"],
  },
  shadows: {
    ...baseTheme.shadows,
    xl: {
      ...baseTheme.shadows.xl,
      shadowColor: "#039BE5",
    },
  },
};

export const abyss: Theme = {
  ...baseTheme,
  id: "ocean-deep",
  name: "Abyss",
  family: "oceanDepth",
  variation: "deep",
  colors: {
    primary: "#1E3A5F",
    secondary: "#0D47A1",
    accent: "#01579B",
    deep: "#0A1929",
    background: "#0A1929",
    surface: "#1E3A5F",
    text: {
      primary: "#E1F5FE",
      secondary: "#90A4AE",
      light: "#546E7A",
      accent: "#4FC3F7",
    },
    error: "#FF5252",
    success: "#69F0AE",
    warning: "#FFD740",
    border: "#102A43",
    skill: {
      grammar: baseTheme.tokens.skill.grammar,
      pronunciation: baseTheme.tokens.skill.pronunciation,
      fluency: baseTheme.tokens.skill.fluency,
      vocabulary: baseTheme.tokens.skill.vocabulary,
    },
  },
  gradients: {
    primary: ["#1E3A5F", "#0D47A1"],
    secondary: ["#0D47A1", "#01579B"],
    surface: ["#0A1929", "#1E3A5F"],
    premium: ["#01579B", "#4FC3F7"],
    card: ["#1E3A5F", "#0D47A1"],
  },
  shadows: {
    ...baseTheme.shadows,
    xl: {
      ...baseTheme.shadows.xl,
      shadowColor: "#4FC3F7",
    },
  },
};
