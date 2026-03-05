import { useTheme } from "./ThemeProvider";
import { baseTheme } from "./base";

/**
 * Bridge hook that maps the new Theme system to the old theme.ts shape.
 * Use this in existing components that were written for the old static theme.
 *
 * The returned object has the same shape as the old `theme` export so
 * existing code like `theme.colors.gradients.primary` still works.
 */
export function useAppTheme() {
  const { theme: t } = useTheme();

  return {
    id: t.id,
    name: t.name,
    family: t.family,
    variation: t.variation,
    theme: t, // Expose raw theme for new components
    colors: {
      ...t.colors,
      primary: t.colors.accent,
      primaryLight: t.colors.secondary,
      secondary: t.colors.success,
      secondaryLight: "#6EE7B7",
      background: t.colors.background,
      surface: t.colors.surface,
      text: {
        primary: t.colors.text.primary,
        secondary: t.colors.text.secondary,
        light: t.colors.text.light,
        accent: t.colors.text.accent,
      },
      error: t.colors.error,
      success: t.colors.success,
      warning: t.colors.warning,
      border: t.colors.border,
      gradients: {
        primary: t.gradients.primary as any,
        secondary: t.gradients.secondary as any,
        surface: t.gradients.surface as any,
        premium: t.gradients.premium as any,
      },
    },
    spacing: t.spacing,
    borderRadius: t.borderRadius,
    typography: {
      ...t.typography,
      lineHeights: {
        s: 20,
        m: 24,
        l: 30,
        xl: 36,
      },
    },
    shadows: {
      ...t.shadows, // Include new shadow system
      small: t.shadows.sm,
      medium: t.shadows.md,
      large: t.shadows.lg,
      primaryGlow: t.shadows.xl,
    },
  };
}

export type AppTheme = ReturnType<typeof useAppTheme>;
