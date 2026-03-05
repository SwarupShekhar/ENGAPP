import { Theme } from "../types";
import { baseTheme } from "../base";

export const dawn: Theme = {
  ...baseTheme,
  id: "sunset-light",
  name: "Dawn",
  family: "sunsetEnergy",
  variation: "light",
  colors: {
    primary: "#FFE0B2",
    secondary: "#FFAB91",
    accent: "#FF7043",
    deep: "#E64A19",
    background: "#FFF8F1",
    surface: "#FFFFFF",
    text: {
      primary: "#BF360C",
      secondary: "#8D6E63",
      light: "#BCAAA4",
      accent: "#FF7043",
    },
    error: "#F43F5E",
    success: "#10B981",
    warning: "#F59E0B",
    border: "#FFCCBC",
    skill: {
      grammar: "#3B82F6",
      pronunciation: "#FF7043",
      fluency: "#10B981",
      vocabulary: "#FFAB91",
    },
  },
  gradients: {
    primary: ["#FFE0B2", "#FFAB91"],
    secondary: ["#FFAB91", "#FF7043"],
    surface: ["#FFF8F1", "#FFFFFF"],
    premium: ["#FF7043", "#E64A19"],
    card: ["#FFFFFF", "#FFE0B2"],
  },
  shadows: {
    ...baseTheme.shadows,
  },
};

export const ember: Theme = {
  ...baseTheme,
  id: "sunset-standard",
  name: "Ember",
  family: "sunsetEnergy",
  variation: "standard",
  colors: {
    primary: "#FFAB40",
    secondary: "#FF6F00",
    accent: "#F57C00",
    deep: "#E65100",
    background: "#FFF3E0",
    surface: "#FFFFFF",
    text: {
      primary: "#E65100",
      secondary: "#795548",
      light: "#A1887F",
      accent: "#F57C00",
    },
    error: "#F43F5E",
    success: "#10B981",
    warning: "#F59E0B",
    border: "#FFE0B2",
    skill: {
      grammar: "#3B82F6",
      pronunciation: "#F57C00",
      fluency: "#10B981",
      vocabulary: "#FFAB40",
    },
  },
  gradients: {
    primary: ["#FFAB40", "#FF6F00"],
    secondary: ["#FF6F00", "#F57C00"],
    surface: ["#FFF3E0", "#FFFFFF"],
    premium: ["#F57C00", "#E65100"],
    card: ["#FFFFFF", "#FFF3E0"],
  },
  shadows: {
    ...baseTheme.shadows,
    xl: {
      ...baseTheme.shadows.xl,
      shadowColor: "#F57C00",
    },
  },
};

export const inferno: Theme = {
  ...baseTheme,
  id: "sunset-deep",
  name: "Inferno",
  family: "sunsetEnergy",
  variation: "deep",
  colors: {
    primary: "#D84315",
    secondary: "#BF360C",
    accent: "#8D0E00",
    deep: "#4E0D06",
    background: "#4E0D06",
    surface: "#D84315",
    text: {
      primary: "#FFE0B2",
      secondary: "#FFAB91",
      light: "#BCAAA4",
      accent: "#FF7043",
    },
    error: "#FF5252",
    success: "#69F0AE",
    warning: "#FFD740",
    border: "#BF360C",
    skill: {
      grammar: "#FF7043",
      pronunciation: "#FFD740",
      fluency: "#69F0AE",
      vocabulary: "#FFE0B2",
    },
  },
  gradients: {
    primary: ["#D84315", "#BF360C"],
    secondary: ["#BF360C", "#8D0E00"],
    surface: ["#4E0D06", "#D84315"],
    premium: ["#8D0E00", "#FF7043"],
    card: ["#D84315", "#BF360C"],
  },
  shadows: {
    ...baseTheme.shadows,
    xl: {
      ...baseTheme.shadows.xl,
      shadowColor: "#FF7043",
    },
  },
};
