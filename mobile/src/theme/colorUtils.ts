/**
 * Utility functions for semantic color usage
 * These provide convenient access to skill and level colors with proper tint backgrounds
 */

import { AppTheme } from './useAppTheme';

// Skill color utilities
export const getSkillColor = (theme: AppTheme, skill: 'grammar' | 'pronunciation' | 'fluency' | 'vocabulary') => {
  return theme.tokens.skill[skill];
};

export const getSkillTint = (theme: AppTheme, skill: 'grammar' | 'pronunciation' | 'fluency' | 'vocabulary') => {
  return theme.tokens.skill[`${skill}Tint` as keyof typeof theme.tokens.skill];
};

export const getSkillColors = (theme: AppTheme, skill: 'grammar' | 'pronunciation' | 'fluency' | 'vocabulary') => {
  return {
    color: getSkillColor(theme, skill),
    tint: getSkillTint(theme, skill),
  };
};

// Level color utilities
export const getLevelColor = (theme: AppTheme, level: 'a1' | 'a2' | 'b1' | 'b2' | 'c1' | 'c2') => {
  return theme.tokens.level[level];
};

export const getLevelTint = (theme: AppTheme, level: 'a1' | 'a2' | 'b1' | 'b2' | 'c1' | 'c2') => {
  return theme.tokens.level[`${level}Tint` as keyof typeof theme.tokens.level];
};

export const getLevelColors = (theme: AppTheme, level: 'a1' | 'a2' | 'b1' | 'b2' | 'c1' | 'c2') => {
  return {
    color: getLevelColor(theme, level),
    tint: getLevelTint(theme, level),
  };
};

// Badge style utilities
export const getSkillBadgeStyle = (theme: AppTheme, skill: 'grammar' | 'pronunciation' | 'fluency' | 'vocabulary') => {
  const { color, tint } = getSkillColors(theme, skill);
  return {
    color, // Text color
    backgroundColor: tint, // Background color
  };
};

export const getLevelBadgeStyle = (theme: AppTheme, level: 'a1' | 'a2' | 'b1' | 'b2' | 'c1' | 'c2') => {
  const { color, tint } = getLevelColors(theme, level);
  return {
    color, // Text color
    backgroundColor: tint, // Background color
  };
};

// Dark theme badge style (inverted for better contrast)
export const getSkillBadgeStyleDark = (theme: AppTheme, skill: 'grammar' | 'pronunciation' | 'fluency' | 'vocabulary') => {
  const { color, tint } = getSkillColors(theme, skill);
  return {
    color: '#FFFFFF', // White text
    backgroundColor: color, // Full color background
  };
};

export const getLevelBadgeStyleDark = (theme: AppTheme, level: 'a1' | 'a2' | 'b1' | 'b2' | 'c1' | 'c2') => {
  const { color, tint } = getLevelColors(theme, level);
  return {
    color: '#FFFFFF', // White text
    backgroundColor: color, // Full color background
  };
};

// Chart/progress utilities
export const getSkillChartColors = (theme: AppTheme, skill: 'grammar' | 'pronunciation' | 'fluency' | 'vocabulary') => {
  const { color, tint } = getSkillColors(theme, skill);
  return {
    primary: color, // Bar/line color
    secondary: tint, // Track/background fill
  };
};

export const getLevelChartColors = (theme: AppTheme, level: 'a1' | 'a2' | 'b1' | 'b2' | 'c1' | 'c2') => {
  const { color, tint } = getLevelColors(theme, level);
  return {
    primary: color, // Bar/line color
    secondary: tint, // Track/background fill
  };
};

// Skill name mapping for display
export const SKILL_NAMES = {
  grammar: 'Grammar',
  pronunciation: 'Pronunciation',
  fluency: 'Fluency',
  vocabulary: 'Vocabulary',
} as const;

// Level name mapping for display
export const LEVEL_NAMES = {
  a1: 'A1',
  a2: 'A2',
  b1: 'B1',
  b2: 'B2',
  c1: 'C1',
  c2: 'C2',
} as const;

// Level descriptions
export const LEVEL_DESCRIPTIONS = {
  a1: 'Beginner',
  a2: 'Elementary',
  b1: 'Intermediate',
  b2: 'Upper-intermediate',
  c1: 'Advanced',
  c2: 'Proficient',
} as const;
