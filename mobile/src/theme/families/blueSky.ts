import { Theme } from "../types";
import { baseTheme } from "../base";

export const blueSkyStandard: Theme = {
  ...baseTheme,
  id: "blueSky-standard",
  name: "Blue Sky",
  family: "blueSky",
  variation: "standard",
  colors: {
    primary: "#4F89E6", // Main gradient top / button color
    secondary: "#3A61A4", // Dimmed blue (secondary)
    accent: "#60A5FA", // Lighter blue for accents
    deep: "#2B4A7A", // Deep blue for contrast (harmonizes with secondary)
    background: "#F5F7FC", // Whitish background from swatch
    surface: "#FFFFFF",
    text: {
      primary: "#1E293B", // Slate-800
      secondary: "#64748B", // Slate-500
      light: "#94A3B8",
      accent: "#4F89E6",
    },
    error: "#EF4444",
    success: "#10B981",
    warning: "#F59E0B",
    border: "#E2E8F0",
    skill: {
      grammar: "#4F89E6",
      pronunciation: "#F59E0B",
      fluency: "#10B981",
      vocabulary: "#3A61A4",
    },
  },
  gradients: {
    primary: ["#4F89E6", "#4574C4"], // Gradient from swatch (top → bottom)
    secondary: ["#5A7BB8", "#3A61A4"],
    surface: ["#FFFFFF", "#F8FAFC"],
    premium: ["#4F89E6", "#3A61A4"],
    card: ["#FFFFFF", "#F1F5F9"],
  },
  shadows: {
    ...baseTheme.shadows,
    xl: {
      ...baseTheme.shadows.xl,
      shadowColor: "#4F89E6",
    },
  },
};

export const blueSkyLight: Theme = {
  ...baseTheme,
  id: "blueSky-light",
  name: "Blue Sky Light",
  family: "blueSky",
  variation: "light",
  colors: {
    primary: "#E0F2FE", // Soft sky blue
    secondary: "#BAE6FD",
    accent: "#7DD3FC",
    deep: "#0284C7",
    background: "#F0F9FF",
    surface: "#FFFFFF",
    text: {
      primary: "#0C4A6E",
      secondary: "#0284C7",
      light: "#38BDF8",
      accent: "#0EA5E9",
    },
    error: "#F43F5E",
    success: "#10B981",
    warning: "#F59E0B",
    border: "#E0F2FE",
    skill: {
      grammar: "#3B82F6",
      pronunciation: "#F59E0B",
      fluency: "#10B981",
      vocabulary: "#0EA5E9",
    },
  },
  gradients: {
    primary: ["#E0F2FE", "#BAE6FD"],
    secondary: ["#BAE6FD", "#7DD3FC"],
    surface: ["#F0F9FF", "#FFFFFF"],
    premium: ["#7DD3FC", "#0284C7"],
    card: ["#FFFFFF", "#E0F2FE"],
  },
  shadows: {
    ...baseTheme.shadows,
  },
};

export const blueSkyDeep: Theme = {
  ...baseTheme,
  id: "blueSky-deep",
  name: "Night Sky",
  family: "blueSky",
  variation: "deep",
  colors: {
    primary: "#1E3A8A", // Deep blue
    secondary: "#1E40AF",
    accent: "#2563EB",
    deep: "#020617", // near black
    background: "#020617",
    surface: "#0F172A",
    text: {
      primary: "#F8FAFC",
      secondary: "#94A3B8",
      light: "#64748B",
      accent: "#60A5FA",
    },
    error: "#EF4444",
    success: "#10B981",
    warning: "#F59E0B",
    border: "#1E293B",
    skill: {
      grammar: "#60A5FA",
      pronunciation: "#FBBF24",
      fluency: "#34D399",
      vocabulary: "#93C5FD",
    },
  },
  gradients: {
    primary: ["#1E3A8A", "#1E40AF"],
    secondary: ["#1E40AF", "#2563EB"],
    surface: ["#020617", "#0F172A"],
    premium: ["#2563EB", "#60A5FA"],
    card: ["#0F172A", "#1E40AF"],
  },
  shadows: {
    ...baseTheme.shadows,
    xl: {
      ...baseTheme.shadows.xl,
      shadowColor: "#60A5FA",
    },
  },
};
