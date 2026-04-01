import { Theme } from "./types";

const semanticTokens = {
  skill: {
    grammar: "#5C6BC0",
    grammarTint: "#E8EAF6",
    pronunciation: "#EF5350",
    pronunciationTint: "#FFEBEE",
    fluency: "#26A69A",
    fluencyTint: "#E0F2F1",
    vocabulary: "#FFA726",
    vocabularyTint: "#FFF8E1",
  },
  level: {
    a1: "#78909C",
    a1Tint: "#ECEFF1",
    a2: "#29B6F6",
    a2Tint: "#E1F5FE",
    b1: "#7E57C2",
    b1Tint: "#EDE7F6",
    b2: "#66BB6A",
    b2Tint: "#E8F5E9",
    c1: "#FFA040",
    c1Tint: "#FFF3E0",
    c2: "#FFD600",
    c2Tint: "#FFFDE7",
  },
};

const baseTheme = {
  tokens: semanticTokens,
  spacing: {
    xs: 4,
    s: 8,
    m: 16,
    l: 24,
    xl: 32,
    xxl: 48,
  },
  borderRadius: {
    s: 8,
    m: 12,
    l: 16,
    xl: 24,
    circle: 9999,
  },
  typography: {
    sizes: {
      xs: 12,
      s: 14,
      m: 16,
      l: 20,
      xl: 24,
      xxl: 32,
    },
    weights: {
      regular: "400",
      medium: "500",
      semibold: "600",
      bold: "700",
      heavy: "800",
      black: "900",
    },
  },
  shadows: {
    sm: {
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.05,
      shadowRadius: 2,
      elevation: 1,
    },
    md: {
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.08,
      shadowRadius: 8,
      elevation: 3,
    },
    lg: {
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.12,
      shadowRadius: 16,
      elevation: 5,
    },
    xl: {
      shadowColor: "#F59E0B",
      shadowOffset: { width: 0, height: 12 },
      shadowOpacity: 0.2,
      shadowRadius: 24,
      elevation: 8,
    },
  },
};

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
      grammar: semanticTokens.skill.grammar,
      pronunciation: semanticTokens.skill.pronunciation,
      fluency: semanticTokens.skill.fluency,
      vocabulary: semanticTokens.skill.vocabulary,
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
