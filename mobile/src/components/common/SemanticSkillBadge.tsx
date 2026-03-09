/**
 * SemanticSkillBadge - Theme-safe skill badge following data-attribute pattern
 * 
 * Usage:
 * <SemanticSkillBadge skill="grammar" score={85} pattern="tinted" />
 * <SemanticSkillBadge skill="pronunciation" pattern="solid" />
 */

import React from 'react';
import { View, Text, StyleSheet, ViewStyle } from 'react-native';
import { useAppTheme } from '../../theme/useAppTheme';
import { getSemanticColors, SkillType, ColorPattern, SKILL_NAMES } from '../../theme/semanticTokens';
import { Ionicons } from '@expo/vector-icons';

interface Props {
  skill: SkillType;
  score?: number;
  pattern?: ColorPattern;
  showLabel?: boolean;
  showIcon?: boolean;
  size?: 'small' | 'medium' | 'large';
  style?: ViewStyle;
}

const SKILL_ICONS = {
  grammar: 'text' as const,
  pronunciation: 'mic' as const,
  fluency: 'water' as const,
  vocabulary: 'book' as const,
};

export function SemanticSkillBadge({
  skill,
  score,
  pattern = 'tinted',
  showLabel = true,
  showIcon = true,
  size = 'medium',
  style,
}: Props) {
  const theme = useAppTheme();
  const styles = getStyles(size);
  const isDarkTheme = theme.variation === 'deep';
  const colors = getSemanticColors(skill, 'skill', pattern, isDarkTheme);

  return (
    <View style={[styles.container, colors, style]}>
      {showIcon && (
        <Ionicons 
          name={SKILL_ICONS[skill]} 
          size={size === 'small' ? 12 : size === 'large' ? 18 : 14} 
          color={colors.color}
          style={styles.icon}
        />
      )}
      {showLabel && (
        <Text style={[styles.label, { color: colors.color }]}>
          {SKILL_NAMES[skill]}
        </Text>
      )}
      {score !== undefined && (
        <Text style={[styles.score, { color: colors.color }]}>
          {score}
        </Text>
      )}
    </View>
  );
}

const getStyles = (size: 'small' | 'medium' | 'large') => {
  const sizeMultiplier = size === 'small' ? 0.8 : size === 'large' ? 1.2 : 1;
  
  return StyleSheet.create({
    container: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 12 * sizeMultiplier,
      paddingVertical: 6 * sizeMultiplier,
      borderRadius: 16 * sizeMultiplier,
      gap: 6 * sizeMultiplier,
      borderWidth: 1,
      alignSelf: 'flex-start',
    },
    icon: {
      marginRight: 2,
    },
    label: {
      fontSize: 14 * sizeMultiplier,
      fontWeight: '600',
    },
    score: {
      fontSize: 12 * sizeMultiplier,
      fontWeight: '700',
      opacity: 0.9,
    },
  });
};
