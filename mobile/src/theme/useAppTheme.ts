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
    colors: {
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
    spacing: baseTheme.spacing,
    borderRadius: baseTheme.borderRadius,
    typography: {
      ...baseTheme.typography,
      lineHeights: {
        s: 20,
        m: 24,
        l: 30,
        xl: 36,
      },
    },
    shadows: {
      small: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 3,
        elevation: 2,
      },
      medium: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.15,
        shadowRadius: 6,
        elevation: 4,
      },
      large: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.2,
        shadowRadius: 10,
        elevation: 10,
      },
      primaryGlow: {
        shadowColor: t.colors.accent,
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.3,
        shadowRadius: 12,
        elevation: 8,
      },
    },
  };
}

export type AppTheme = ReturnType<typeof useAppTheme>;
