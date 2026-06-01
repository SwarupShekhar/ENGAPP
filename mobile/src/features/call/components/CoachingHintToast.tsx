import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useAppTheme } from '../../../theme/useAppTheme';
import type { CoachingHint } from '../hooks/useCoachingHints';

interface Props {
  hint: CoachingHint | null;
  onDismiss: () => void;
}

export function CoachingHintToast({ hint, onDismiss }: Props) {
  const theme = useAppTheme();
  const translateY = useRef(new Animated.Value(80)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (hint) {
      Animated.parallel([
        Animated.spring(translateY, {
          toValue: 0,
          useNativeDriver: true,
          tension: 100,
          friction: 12,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(translateY, {
          toValue: 80,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [hint]);

  if (!hint) return null;

  const c = theme.colors;

  return (
    <Animated.View
      style={[
        styles.container,
        {
          backgroundColor: c.surface,
          borderColor: c.primary,
          transform: [{ translateY }],
          opacity,
        },
      ]}
    >
      <Text style={styles.emoji}>💡</Text>
      <Text
        style={[styles.text, { color: c.text.primary }]}
        numberOfLines={2}
      >
        {hint.text}
      </Text>
      <TouchableOpacity
        onPress={onDismiss}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Text style={[styles.dismiss, { color: c.text.secondary }]}>✕</Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 96,
    left: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
    zIndex: 999,
  },
  emoji: { fontSize: 18 },
  text: { flex: 1, fontSize: 13, fontWeight: '600', lineHeight: 18 },
  dismiss: { fontSize: 16, fontWeight: '700' },
});
