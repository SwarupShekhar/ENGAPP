/**
 * SemanticProgressBar - Theme-safe progress bar for skills/levels
 * 
 * Usage:
 * <SemanticProgressBar skill="grammar" progress={85} />
 * <SemanticProgressBar level="b1" progress={60} />
 */

import React from 'react';
import { View, Text, StyleSheet, ViewStyle } from 'react-native';
import { useAppTheme } from '../../theme/useAppTheme';
import { getProgressColors, SkillType, LevelType } from '../../theme/semanticTokens';

interface Props {
  skill?: SkillType;
  level?: LevelType;
  progress: number; // 0-100
  showLabel?: boolean;
  height?: number;
  style?: ViewStyle;
}

export function SemanticProgressBar({
  skill,
  level,
  progress,
  showLabel = true,
  height = 8,
  style,
}: Props) {
  const theme = useAppTheme();
  const styles = getStyles(height);
  const isDarkTheme = theme.variation === 'deep';
  
  // Determine category and type
  const category = skill ? 'skill' : 'level';
  const type = skill || level;
  
  if (!type) {
    throw new Error('Either skill or level must be provided');
  }
  
  const colors = getProgressColors(type, category, isDarkTheme);

  return (
    <View style={[styles.container, style]}>
      {showLabel && (
        <Text style={[styles.label, { color: colors.label }]}>
          {Math.round(progress)}%
        </Text>
      )}
      <View style={[styles.track, { backgroundColor: colors.track, height }]}>
        <View 
          style={[
            styles.fill, 
            { 
              backgroundColor: colors.fill,
              width: `${Math.max(2, Math.min(100, progress))}%`,
              height 
            }
          ]} 
        />
      </View>
    </View>
  );
}

const getStyles = (height: number) => StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    minWidth: 32,
    textAlign: 'right',
  },
  track: {
    flex: 1,
    borderRadius: height / 2,
    overflow: 'hidden',
  },
  fill: {
    borderRadius: height / 2,
    minWidth: 2, // Always show some progress
  },
});
