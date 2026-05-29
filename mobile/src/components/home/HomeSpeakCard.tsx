import React from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../theme/useAppTheme';

export type CardState = 'ready' | 'recording' | 'assessing' | 'fail' | 'pass_partial' | 'done_today';

interface HomeSpeakCardProps {
  pillLabel: string;
  pillColor: string;
  children: React.ReactNode;
  badge?: string;
  cardState: CardState;
  onMicPressIn: () => void;
  onMicPressOut: () => void;
  failMessage?: string;
  doneMessage?: string;
  disabled?: boolean;
}

export function HomeSpeakCard({
  pillLabel,
  pillColor,
  children,
  badge,
  cardState,
  onMicPressIn,
  onMicPressOut,
  failMessage,
  doneMessage,
  disabled = false,
}: HomeSpeakCardProps) {
  const theme = useAppTheme();
  const c = theme.colors;
  const styles = getStyles(theme);

  const micDisabled = disabled || cardState === 'assessing' || cardState === 'done_today';

  const micLabel = (() => {
    switch (cardState) {
      case 'recording': return 'Listening…';
      case 'assessing': return 'Checking pronunciation…';
      case 'done_today': return doneMessage ?? 'Done for today';
      case 'fail': return failMessage ?? 'Try again';
      case 'pass_partial': return failMessage ?? 'Once more';
      default: return 'Hold and speak';
    }
  })();

  return (
    <View style={[styles.card, { borderColor: c.border }]}>
      <View style={styles.pillRow}>
        <View style={[styles.pill, { backgroundColor: `${pillColor}18` }]}>
          <Ionicons name="mic" size={13} color={pillColor} />
          <Text style={[styles.pillText, { color: pillColor }]}>{pillLabel}</Text>
        </View>
        {badge ? <Text style={[styles.badge, { color: c.text.secondary }]}>{badge}</Text> : null}
      </View>

      <View style={{ flex: 1 }}>{children}</View>

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
            onPressIn={micDisabled ? undefined : onMicPressIn}
            onPressOut={micDisabled ? undefined : onMicPressOut}
            disabled={micDisabled}
            style={({ pressed }) => [
              styles.micBtn,
              {
                backgroundColor: micDisabled
                  ? `${c.primary}40`
                  : cardState === 'recording'
                  ? ((c as any).error ?? '#ef4444')
                  : c.primary,
                opacity: pressed && !micDisabled ? 0.85 : 1,
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
    micArea: { alignItems: 'center', gap: 6 },
    micBtn: {
      width: 52,
      height: 52,
      borderRadius: 26,
      alignItems: 'center',
      justifyContent: 'center',
    },
    micLabel: { fontSize: 11, textAlign: 'center' },
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
