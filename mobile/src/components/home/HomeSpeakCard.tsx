import React from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../theme/useAppTheme';

// Graceful no-op when expo-haptics is unavailable (web / stripped builds)
let Haptics: any = { impactAsync: async () => {}, ImpactFeedbackStyle: {} };
try { Haptics = require('expo-haptics'); } catch { /* optional */ }

export type CardState = 'ready' | 'recording' | 'assessing' | 'fail' | 'pass_partial' | 'done_today';

interface HomeSpeakCardProps {
  pillLabel: string;
  pillColor: string;
  children: React.ReactNode;
  badge?: string;
  cardState: CardState;
  onMicPress: () => void;
  failMessage?: string;
  doneMessage?: string;
  disabled?: boolean;
  listenEnabled?: boolean;
  listenPlaying?: boolean;
  onListenPress?: () => void;
  /** Screen-reader summary for the card content (card type + content). */
  contentAccessibilityLabel?: string;
}

export function HomeSpeakCard({
  pillLabel,
  pillColor,
  children,
  badge,
  cardState,
  onMicPress,
  failMessage,
  doneMessage,
  disabled = false,
  listenEnabled = false,
  listenPlaying = false,
  onListenPress,
  contentAccessibilityLabel,
}: HomeSpeakCardProps) {
  const theme = useAppTheme();
  const c = theme.colors;
  const styles = getStyles(theme);

  const micDisabled = disabled || cardState === 'assessing' || cardState === 'done_today';

  const micLabel = (() => {
    switch (cardState) {
      case 'recording':
        return 'Tap when you are done speaking';
      case 'assessing':
        return 'Checking pronunciation…';
      case 'done_today':
        return doneMessage ?? 'Done for today';
      case 'fail':
        return failMessage ?? 'Try again';
      case 'pass_partial':
        return failMessage ?? 'Once more';
      default:
        return listenEnabled ? 'Listen, then tap the mic' : 'Tap mic and speak';
    }
  })();

  const showListen =
    listenEnabled &&
    onListenPress &&
    cardState !== 'done_today' &&
    cardState !== 'assessing' &&
    cardState !== 'recording';

  return (
    <View style={[styles.card, { borderColor: c.border }]}>
      <View style={styles.pillRow}>
        <View style={[styles.pill, { backgroundColor: `${pillColor}18` }]}>
          <Ionicons name="mic" size={13} color={pillColor} />
          <Text style={[styles.pillText, { color: pillColor }]}>{pillLabel}</Text>
        </View>
        {badge ? <Text style={[styles.badge, { color: c.text.secondary }]}>{badge}</Text> : null}
      </View>

      <View
        style={{ flex: 1 }}
        accessible={!!contentAccessibilityLabel}
        accessibilityLabel={contentAccessibilityLabel}
      >
        {children}
      </View>

      {showListen ? (
        <Pressable
          onPress={onListenPress}
          disabled={disabled}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Listen to pronunciation"
          style={({ pressed }) => [
            styles.listenBtn,
            {
              backgroundColor: listenPlaying ? `${c.primary}22` : `${c.primary}12`,
              borderColor: listenPlaying ? c.primary : c.border,
              opacity: pressed ? 0.85 : 1,
            },
          ]}
        >
          <Ionicons
            name={listenPlaying ? 'stop-circle' : 'volume-high'}
            size={18}
            color={c.primary}
          />
          <Text style={[styles.listenText, { color: c.primary }]}>
            {listenPlaying ? 'Playing… tap to stop' : 'Listen'}
          </Text>
        </Pressable>
      ) : null}

      <View style={styles.micArea}>
        {cardState === 'done_today' ? (
          <View style={[styles.doneRow, { backgroundColor: `${(c as any).success ?? '#4ade80'}18` }]}>
            <Ionicons name="checkmark-circle" size={20} color={(c as any).success ?? '#4ade80'} />
            <Text style={[styles.doneText, { color: (c as any).success ?? '#4ade80' }]}>
              {doneMessage ?? 'Done for today'}
            </Text>
          </View>
        ) : (
          <Pressable
            onPress={micDisabled ? undefined : () => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {}); onMicPress(); }}
            disabled={micDisabled}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={cardState === 'recording' ? 'Stop recording' : 'Start recording'}
            accessibilityState={{ disabled: micDisabled }}
            style={({ pressed }) => [
              styles.micBtn,
              {
                backgroundColor: micDisabled
                  ? `${c.primary}40`
                  : cardState === 'recording'
                    ? ((c as any).error ?? '#ef4444')
                    : c.primary,
                opacity: pressed && !micDisabled ? 0.9 : 1,
              },
            ]}
          >
            {cardState === 'assessing' ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Ionicons name={cardState === 'recording' ? 'stop' : 'mic'} size={20} color="#fff" />
            )}
          </Pressable>
        )}
        <Text style={[styles.micLabel, { color: c.text.secondary }]}>{micLabel}</Text>
      </View>
    </View>
  );
}

const getStyles = (theme: ReturnType<typeof useAppTheme>) =>
  StyleSheet.create({
    card: {
      flex: 1,
      padding: 16,
      borderRadius: 20,
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      gap: 10,
      justifyContent: 'space-between',
      minHeight: 248,
    },
    pillRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    pill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 12,
    },
    pillText: { fontSize: 11, fontWeight: '700' },
    badge: { fontSize: 12, fontWeight: '700' },
    listenBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      paddingVertical: 10,
      paddingHorizontal: 14,
      borderRadius: 12,
      borderWidth: 1,
    },
    listenText: { fontSize: 13, fontWeight: '700' },
    micArea: { alignItems: 'center', gap: 6 },
    micBtn: {
      width: 52,
      height: 52,
      borderRadius: 26,
      alignItems: 'center',
      justifyContent: 'center',
    },
    micLabel: { fontSize: 11, textAlign: 'center', paddingHorizontal: 8 },
    doneRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderRadius: 12,
    },
    doneText: { fontWeight: '700', fontSize: 13 },
  });
