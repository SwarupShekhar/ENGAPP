import { Theme } from "../types";
import { baseTheme } from "../base";

export const paolumu: Theme = {
  ...baseTheme,
  id: "purple-light",
  name: "Paolumu",
  family: "purpleDream",
  variation: "light",
  colors: {
    primary: "#CFCBD2",
    secondary: "#CB98ED",
    accent: "#8B63DA",
    deep: "#3C21B7",
    background: "#F8F7FF",
    surface: "#FFFFFF",
    text: {
      primary: "#3C21B7",
      secondary: "#64748B",
      light: "#94A3B8",
      accent: "#8B63DA",
    },
    error: "#F43F5E",
    success: "#10B981",
    warning: "#F59E0B",
    border: "#E2E8F0",
  },
  gradients: {
    primary: ["#CB98ED", "#8B63DA"],
    secondary: ["#CFCBD2", "#CB98ED"],
    surface: ["#F8F7FF", "#FFFFFF"],
    premium: ["#8B63DA", "#3C21B7"],
    card: ["#FFFFFF", "#F1F5F9"],
  },
};

export const paodana: Theme = {
  ...baseTheme,
  id: "purple-standard",
  name: "Paodana",
  family: "purpleDream",
  variation: "standard",
  colors: {
    primary: "#591DA9",
    secondary: "#3C21B7",
    accent: "#8B63DA",
    deep: "#020B2E",
    background: "#F0F2F8",
    surface: "#FFFFFF",
    text: {
      primary: "#0F172A",
      secondary: "#64748B",
      light: "#94A3B8",
      accent: "#6366F1",
    },
    error: "#F43F5E",
    success: "#10B981",
    warning: "#F59E0B",
    border: "#334155",
  },
  gradients: {
    primary: ["#591DA9", "#3C21B7"],
    secondary: ["#8B63DA", "#591DA9"],
    surface: ["#591DA9", "#3C21B7"],
    premium: ["#8B5CF6", "#D946EF"],
    card: ["#FFFFFF", "#F8FAFC"],
  },
};

export const paoazur: Theme = {
  ...baseTheme,
  id: "purple-fresh",
  name: "Paoazur",
  family: "purpleDream",
  variation: "light",
  colors: {
    primary: "#FBC2EB",
    secondary: "#A6C1EE",
    accent: "#78A3EB",
    deep: "#4A7AC2",
    background: "#FDF2F8",
    surface: "#FFFFFF",
    text: {
      primary: "#1E293B",
      secondary: "#64748B",
      light: "#94A3B8",
      accent: "#78A3EB",
    },
    error: "#F43F5E",
    success: "#10B981",
    warning: "#F59E0B",
    border: "#E2E8F0",
  },
  gradients: {
    primary: ["#FBC2EB", "#A6C1EE"],
    secondary: ["#A6C1EE", "#78A3EB"],
    surface: ["#FDF2F8", "#FFFFFF"],
    premium: ["#78A3EB", "#4A7AC2"],
    card: ["#FFFFFF", "#FDF2F8"],
  },
};
