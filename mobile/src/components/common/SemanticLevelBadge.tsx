/**
 * SemanticLevelBadge - Theme-safe level badge following data-attribute pattern
 * 
 * Usage:
 * <SemanticLevelBadge level="b1" pattern="tinted" />
 * <SemanticLevelBadge level="c2" pattern="solid" showDescription={true} />
 */

import React from 'react';
import { View, Text, StyleSheet, ViewStyle } from 'react-native';
import { useAppTheme } from '../../theme/useAppTheme';
import { getSemanticColors, LevelType, ColorPattern, LEVEL_NAMES, LEVEL_DESCRIPTIONS } from '../../theme/semanticTokens';
import { Ionicons } from '@expo/vector-icons';

interface Props {
  level: LevelType;
  pattern?: ColorPattern;
  showDescription?: boolean;
  showIcon?: boolean;
  size?: 'small' | 'medium' | 'large';
  style?: ViewStyle;
}

export function SemanticLevelBadge({
  level,
  pattern = 'tinted',
  showDescription = false,
  showIcon = true,
  size = 'medium',
  style,
}: Props) {
  const theme = useAppTheme();
  const styles = getStyles(size);
  const isDarkTheme = theme.variation === 'deep';
  const colors = getSemanticColors(level, 'level', pattern, isDarkTheme);

  return (
    <View style={[styles.container, colors, style]}>
      {showIcon && (
        <Ionicons 
          name="shield-checkmark" 
          size={size === 'small' ? 12 : size === 'large' ? 18 : 16} 
          color={colors.color}
          style={styles.icon}
        />
      )}
      <Text style={[styles.levelText, { color: colors.color }]}>
        {LEVEL_NAMES[level]}
      </Text>
      {showDescription && (
        <Text style={[styles.description, { color: colors.color, opacity: 0.8 }]}>
          {LEVEL_DESCRIPTIONS[level]}
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
      borderWidth: 1.5,
      alignSelf: 'flex-start',
    },
    icon: {
      marginRight: 2,
    },
    levelText: {
      fontSize: 14 * sizeMultiplier,
      fontWeight: '700',
    },
    description: {
      fontSize: 10 * sizeMultiplier,
      fontWeight: '500',
    },
  });
};
