import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../theme/useAppTheme';
import { userApi } from '../../api/user';
import type { DailyListenVoice } from '../../types/dailyListenVoice';

type Props = {
  visible: boolean;
  onComplete: (voice: DailyListenVoice) => void;
};

const VOICES: { id: DailyListenVoice; label: string; subtitle: string }[] = [
  { id: 'Kiki', label: 'Kiki', subtitle: 'Warm and friendly' },
  { id: 'Jasper', label: 'Jasper', subtitle: 'Clear and steady' },
];

export function DailyListenVoiceModal({ visible, onComplete }: Props) {
  const theme = useAppTheme();
  const [saving, setSaving] = useState<DailyListenVoice | null>(null);

  const choose = async (voice: DailyListenVoice) => {
    if (saving) return;
    setSaving(voice);
    try {
      await userApi.updateListenVoice({ voice, chosen: true });
      onComplete(voice);
    } catch (e) {
      if (__DEV__) console.warn('[DailyListenVoice] save failed:', e);
    } finally {
      setSaving(null);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.backdrop}>
        <View style={[styles.card, { backgroundColor: theme.colors.surface }]}>
          <Ionicons name="volume-high-outline" size={28} color={theme.colors.primary} />
          <Text style={[styles.title, { color: theme.colors.text.primary }]}>
            Choose your listen voice
          </Text>
          <Text style={[styles.subtitle, { color: theme.colors.text.secondary }]}>
            Used for phrase of the day, word of the day, and short Maya replies.
          </Text>

          {VOICES.map((v) => {
            const busy = saving === v.id;
            return (
              <TouchableOpacity
                key={v.id}
                style={[
                  styles.option,
                  { borderColor: theme.colors.border, backgroundColor: theme.colors.background },
                ]}
                onPress={() => choose(v.id)}
                disabled={!!saving}
              >
                <View>
                  <Text style={[styles.optionLabel, { color: theme.colors.text.primary }]}>{v.label}</Text>
                  <Text style={[styles.optionSub, { color: theme.colors.text.secondary }]}>
                    {v.subtitle}
                  </Text>
                </View>
                {busy ? (
                  <ActivityIndicator color={theme.colors.primary} />
                ) : (
                  <Ionicons name="chevron-forward" size={18} color={theme.colors.text.secondary} />
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    borderRadius: 20,
    padding: 22,
    gap: 12,
    alignItems: 'stretch',
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    marginTop: 4,
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 8,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
  },
  optionLabel: {
    fontSize: 16,
    fontWeight: '600',
  },
  optionSub: {
    fontSize: 13,
    marginTop: 2,
  },
});
