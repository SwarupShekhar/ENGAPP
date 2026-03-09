/**
 * LevelBadge - A reusable component for displaying CEFR levels with semantic colors
 * 
 * Usage examples:
 * <LevelBadge level="b1" />
 * <LevelBadge level="c2" showDescription={true} />
 * <LevelBadge level="a2" variant="outline" />
 */

import React from 'react';
import { View, Text, StyleSheet, ViewStyle } from 'react-native';
import { useAppTheme } from '../../theme/useAppTheme';
import { getLevelColors, getLevelBadgeStyle, getLevelBadgeStyleDark, LEVEL_NAMES, LEVEL_DESCRIPTIONS } from '../../theme/colorUtils';
import { Ionicons } from '@expo/vector-icons';

interface Props {
  level: 'a1' | 'a2' | 'b1' | 'b2' | 'c1' | 'c2';
  variant?: 'filled' | 'outline' | 'card';
  showDescription?: boolean;
  showIcon?: boolean;
  size?: 'small' | 'medium' | 'large';
  darkMode?: boolean;
  style?: ViewStyle;
}

export function LevelBadge({
  level,
  variant = 'filled',
  showDescription = false,
  showIcon = true,
  size = 'medium',
  darkMode = false,
  style,
}: Props) {
  const theme = useAppTheme();
  const styles = getStyles(theme, size);
  const { color, tint } = getLevelColors(theme, level);
  
  const getBadgeStyle = () => {
    if (variant === 'filled') {
      return darkMode ? getLevelBadgeStyleDark(theme, level) : getLevelBadgeStyle(theme, level);
    }
    return { color, backgroundColor: 'transparent' };
  };
  
  const getOutlineStyle = () => {
    if (variant === 'outline') {
      return {
        backgroundColor: 'transparent',
        borderWidth: 2,
        borderColor: color,
      };
    }
    return {};
  };

  const badgeStyle = getBadgeStyle();

  if (variant === 'card') {
    return (
      <View style={[styles.cardContainer, style]}>
        <View style={[styles.cardHeader, { backgroundColor: tint }]}>
          {showIcon && (
            <Ionicons 
              name="shield-checkmark" 
              size={size === 'small' ? 16 : size === 'large' ? 24 : 20} 
              color={color} 
            />
          )}
          <Text style={[styles.cardLevel, { color }]}>
            {LEVEL_NAMES[level]}
          </Text>
        </View>
        {showDescription && (
          <View style={styles.cardContent}>
            <Text style={[styles.cardDescription, { color: theme.colors.text.secondary }]}>
              {LEVEL_DESCRIPTIONS[level]}
            </Text>
          </View>
        )}
      </View>
    );
  }

  return (
    <View style={[styles.container, badgeStyle, getOutlineStyle(), style]}>
      {showIcon && (
        <Ionicons 
          name="shield-checkmark" 
          size={size === 'small' ? 12 : size === 'large' ? 16 : 14} 
          color={badgeStyle.color} 
          style={styles.icon}
        />
      )}
      <Text style={[styles.text, { color: badgeStyle.color }]}>
        {LEVEL_NAMES[level]}
      </Text>
      {showDescription && (
        <Text style={[styles.description, { color: badgeStyle.color, opacity: 0.8 }]}>
          {LEVEL_DESCRIPTIONS[level]}
        </Text>
      )}
    </View>
  );
}

const getStyles = (theme: any, size: 'small' | 'medium' | 'large') => {
  const sizeMultiplier = size === 'small' ? 0.8 : size === 'large' ? 1.2 : 1;
  
  return StyleSheet.create({
    container: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 12 * sizeMultiplier,
      paddingVertical: 6 * sizeMultiplier,
      borderRadius: 16 * sizeMultiplier,
      gap: 6 * sizeMultiplier,
      alignSelf: 'flex-start',
    },
    icon: {
      marginRight: 2,
    },
    text: {
      fontSize: 14 * sizeMultiplier,
      fontWeight: '700',
    },
    description: {
      fontSize: 10 * sizeMultiplier,
      fontWeight: '500',
    },
    
    // Card variant
    cardContainer: {
      backgroundColor: theme.colors.surface,
      borderRadius: 12 * sizeMultiplier,
      borderWidth: 1,
      borderColor: theme.colors.border,
      overflow: 'hidden',
      minWidth: 120 * sizeMultiplier,
    },
    cardHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 12 * sizeMultiplier,
      paddingVertical: 8 * sizeMultiplier,
      gap: 8 * sizeMultiplier,
    },
    cardLevel: {
      fontSize: 16 * sizeMultiplier,
      fontWeight: '700',
    },
    cardContent: {
      paddingHorizontal: 12 * sizeMultiplier,
      paddingVertical: 8 * sizeMultiplier,
    },
    cardDescription: {
      fontSize: 12 * sizeMultiplier,
      fontWeight: '500',
      textAlign: 'center',
    },
  });
};
