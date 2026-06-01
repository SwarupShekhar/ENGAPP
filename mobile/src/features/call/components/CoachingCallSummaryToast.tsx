import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useAppTheme } from '../../../theme/useAppTheme';

interface Props {
  message: string | null;
  phrases: string[];
  onDismiss: () => void;
}

export function CoachingCallSummaryToast({ message, phrases, onDismiss }: Props) {
  const theme = useAppTheme();
  const c = theme.colors;
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(40)).current;

  useEffect(() => {
    if (message) {
      Animated.parallel([
        Animated.timing(opacity, { toValue: 1, duration: 300, useNativeDriver: true }),
        Animated.spring(translateY, { toValue: 0, useNativeDriver: true, tension: 80, friction: 10 }),
      ]).start();
      const t = setTimeout(onDismiss, 6000);
      return () => clearTimeout(t);
    }
  }, [message, onDismiss]);

  if (!message) return null;

  return (
    <Animated.View style={[styles.container, { backgroundColor: c.surface, borderColor: c.primary, opacity, transform: [{ translateY }] }]}>
      <Text style={styles.emoji}>🎉</Text>
      <View style={{ flex: 1 }}>
        <Text style={[styles.message, { color: c.text.primary }]}>{message}</Text>
        {phrases.length > 0 && (
          <Text style={[styles.sub, { color: c.text.secondary }]}>
            {phrases.map((p) => `"${p}"`).join(', ')}
          </Text>
        )}
      </View>
      <TouchableOpacity onPress={onDismiss} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
        <Text style={[styles.dismiss, { color: c.text.secondary }]}>✕</Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 32,
    left: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    padding: 14,
    borderRadius: 16,
    borderWidth: 1.5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.18,
    shadowRadius: 10,
    elevation: 6,
    zIndex: 1000,
  },
  emoji: { fontSize: 20 },
  message: { fontSize: 13, fontWeight: '700', lineHeight: 18 },
  sub: { fontSize: 11, marginTop: 2 },
  dismiss: { fontSize: 16, fontWeight: '700', marginTop: 2 },
});
