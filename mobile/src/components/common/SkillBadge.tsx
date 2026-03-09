/**
 * SkillBadge - A reusable component for displaying skill information with semantic colors
 * 
 * Usage examples:
 * <SkillBadge skill="grammar" score={85} showLabel={true} />
 * <SkillBadge skill="pronunciation" score={92} variant="compact" />
 * <SkillBadge skill="fluency" score={78} variant="card" />
 */

import React from 'react';
import { View, Text, StyleSheet, ViewStyle } from 'react-native';
import { useAppTheme } from '../../theme/useAppTheme';
import { getSkillColors, getSkillBadgeStyle, SKILL_NAMES } from '../../theme/colorUtils';
import { Ionicons } from '@expo/vector-icons';

interface Props {
  skill: 'grammar' | 'pronunciation' | 'fluency' | 'vocabulary';
  score?: number;
  variant?: 'badge' | 'compact' | 'card';
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

export function SkillBadge({
  skill,
  score,
  variant = 'badge',
  showLabel = true,
  showIcon = true,
  size = 'medium',
  style,
}: Props) {
  const theme = useAppTheme();
  const styles = getStyles(theme, size);
  const { color, tint } = getSkillColors(theme, skill);
  const badgeStyle = getSkillBadgeStyle(theme, skill);

  if (variant === 'compact') {
    return (
      <View style={[styles.compactContainer, { backgroundColor: tint }, style]}>
        {showIcon && (
          <Ionicons 
            name={SKILL_ICONS[skill]} 
            size={size === 'small' ? 12 : size === 'large' ? 18 : 14} 
            color={color} 
            style={styles.compactIcon}
          />
        )}
        <Text style={[styles.compactText, { color }]}>
          {showLabel ? SKILL_NAMES[skill] : ''}
          {score !== undefined && `: ${score}`}
        </Text>
      </View>
    );
  }

  if (variant === 'card') {
    return (
      <View style={[styles.cardContainer, style]}>
        <View style={[styles.cardHeader, { backgroundColor: tint }]}>
          {showIcon && (
            <Ionicons 
              name={SKILL_ICONS[skill]} 
              size={size === 'small' ? 16 : size === 'large' ? 24 : 20} 
              color={color} 
            />
          )}
          <Text style={[styles.cardTitle, { color }]}>
            {SKILL_NAMES[skill]}
          </Text>
        </View>
        {score !== undefined && (
          <View style={styles.cardContent}>
            <Text style={[styles.cardScore, { color: theme.colors.text.primary }]}>
              {score}
            </Text>
            <Text style={[styles.cardLabel, { color: theme.colors.text.secondary }]}>
              Proficiency
            </Text>
          </View>
        )}
      </View>
    );
  }

  // Default badge variant
  return (
    <View style={[styles.badgeContainer, badgeStyle, style]}>
      {showIcon && (
        <Ionicons 
          name={SKILL_ICONS[skill]} 
          size={size === 'small' ? 12 : size === 'large' ? 18 : 14} 
          color={badgeStyle.color} 
          style={styles.badgeIcon}
        />
      )}
      {showLabel && (
        <Text style={[styles.badgeText, { color: badgeStyle.color }]}>
          {SKILL_NAMES[skill]}
        </Text>
      )}
      {score !== undefined && (
        <Text style={[styles.badgeScore, { color: badgeStyle.color }]}>
          {score}
        </Text>
      )}
    </View>
  );
}

const getStyles = (theme: any, size: 'small' | 'medium' | 'large') => {
  const sizeMultiplier = size === 'small' ? 0.8 : size === 'large' ? 1.2 : 1;
  
  return StyleSheet.create({
    // Default badge variant
    badgeContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 12 * sizeMultiplier,
      paddingVertical: 6 * sizeMultiplier,
      borderRadius: 16 * sizeMultiplier,
      gap: 6 * sizeMultiplier,
    },
    badgeIcon: {
      marginRight: 2,
    },
    badgeText: {
      fontSize: 14 * sizeMultiplier,
      fontWeight: '600',
    },
    badgeScore: {
      fontSize: 12 * sizeMultiplier,
      fontWeight: '700',
      opacity: 0.9,
    },
    
    // Compact variant
    compactContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 8 * sizeMultiplier,
      paddingVertical: 4 * sizeMultiplier,
      borderRadius: 8 * sizeMultiplier,
      gap: 4 * sizeMultiplier,
    },
    compactIcon: {
      marginRight: 2,
    },
    compactText: {
      fontSize: 12 * sizeMultiplier,
      fontWeight: '600',
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
    cardTitle: {
      fontSize: 14 * sizeMultiplier,
      fontWeight: '600',
    },
    cardContent: {
      paddingHorizontal: 12 * sizeMultiplier,
      paddingVertical: 8 * sizeMultiplier,
      alignItems: 'center',
    },
    cardScore: {
      fontSize: 24 * sizeMultiplier,
      fontWeight: '700',
    },
    cardLabel: {
      fontSize: 10 * sizeMultiplier,
      fontWeight: '500',
      marginTop: 2,
    },
  });
};
