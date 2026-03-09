/**
 * Semantic Color Tokens - These never change with theme
 * Base colors + light/dark tints for proper contrast
 */

export const SEMANTIC_TOKENS = {
  // Skill — Base Colors
  skill: {
    grammar: '#5C6BC0',
    pronunciation: '#EF5350',
    fluency: '#26A69A',
    vocabulary: '#FFA726',
  },
  
  // Skill — Light Tints (for light theme backgrounds)
  skillTint: {
    grammar: '#E8EAF6',
    pronunciation: '#FFEBEE',
    fluency: '#E0F2F1',
    vocabulary: '#FFF8E1',
  },
  
  // Skill — Dark Tints (for dark theme backgrounds)
  skillTintDark: {
    grammar: '#1E2140',
    pronunciation: '#2D1414',
    fluency: '#0D2422',
    vocabulary: '#2D2000',
  },
  
  // Level — Base Colors
  level: {
    a1: '#78909C',
    a2: '#29B6F6',
    b1: '#7E57C2',
    b2: '#66BB6A',
    c1: '#FFA040',
    c2: '#FFD600',
  },
  
  // Level — Light Tints
  levelTint: {
    a1: '#ECEFF1',
    a2: '#E1F5FE',
    b1: '#EDE7F6',
    b2: '#E8F5E9',
    c1: '#FFF3E0',
    c2: '#FFFDE7',
  },
  
  // Level — Dark Tints
  levelTintDark: {
    a1: '#1A2226',
    a2: '#0A2233',
    b1: '#1E1433',
    b2: '#122214',
    c1: '#2D1F00',
    c2: '#2D2A00',
  },
} as const;

// Helper types
export type SkillType = 'grammar' | 'pronunciation' | 'fluency' | 'vocabulary';
export type LevelType = 'a1' | 'a2' | 'b1' | 'b2' | 'c1' | 'c2';
export type ColorPattern = 'solid' | 'tinted';

// Utility functions for React Native styling
export const getSemanticColors = (
  type: SkillType | LevelType,
  category: 'skill' | 'level',
  pattern: ColorPattern,
  isDarkTheme: boolean = false
) => {
  if (category === 'skill') {
    const tokens = SEMANTIC_TOKENS.skill;
    const tints = isDarkTheme ? SEMANTIC_TOKENS.skillTintDark : SEMANTIC_TOKENS.skillTint;
    const baseColor = tokens[type as SkillType];
    const tintColor = tints[type as SkillType];
    
    if (pattern === 'solid') {
      return {
        backgroundColor: baseColor,
        color: '#FFFFFF', // Always white text on solid colors
        borderColor: baseColor,
      };
    }
    
    // Tinted pattern
    return {
      backgroundColor: tintColor,
      color: baseColor, // Always base color as text on tints
      borderColor: baseColor,
    };
  } else {
    // Level category
    const tokens = SEMANTIC_TOKENS.level;
    const tints = isDarkTheme ? SEMANTIC_TOKENS.levelTintDark : SEMANTIC_TOKENS.levelTint;
    const baseColor = tokens[type as LevelType];
    const tintColor = tints[type as LevelType];
    
    if (pattern === 'solid') {
      return {
        backgroundColor: baseColor,
        color: '#FFFFFF', // Always white text on solid colors
        borderColor: baseColor,
      };
    }
    
    // Tinted pattern
    return {
      backgroundColor: tintColor,
      color: baseColor, // Always base color as text on tints
      borderColor: baseColor,
    };
  }
};

// Progress bar utilities
export const getProgressColors = (
  type: SkillType | LevelType,
  category: 'skill' | 'level',
  isDarkTheme: boolean = false
) => {
  if (category === 'skill') {
    const tokens = SEMANTIC_TOKENS.skill;
    const tints = isDarkTheme ? SEMANTIC_TOKENS.skillTintDark : SEMANTIC_TOKENS.skillTint;
    return {
      fill: tokens[type as SkillType],        // Progress bar fill
      track: tints[type as SkillType],       // Progress bar track
      label: tokens[type as SkillType],       // Label text color
    };
  } else {
    const tokens = SEMANTIC_TOKENS.level;
    const tints = isDarkTheme ? SEMANTIC_TOKENS.levelTintDark : SEMANTIC_TOKENS.levelTint;
    return {
      fill: tokens[type as LevelType],        // Progress bar fill
      track: tints[type as LevelType],       // Progress bar track
      label: tokens[type as LevelType],       // Label text color
    };
  }
};

// Constants for display names
export const SKILL_NAMES = {
  grammar: 'Grammar',
  pronunciation: 'Pronunciation',
  fluency: 'Fluency',
  vocabulary: 'Vocabulary',
} as const;

export const LEVEL_NAMES = {
  a1: 'A1',
  a2: 'A2',
  b1: 'B1',
  b2: 'B2',
  c1: 'C1',
  c2: 'C2',
} as const;

export const LEVEL_DESCRIPTIONS = {
  a1: 'Beginner',
  a2: 'Elementary',
  b1: 'Intermediate',
  b2: 'Upper-intermediate',
  c1: 'Advanced',
  c2: 'Proficient',
} as const;
