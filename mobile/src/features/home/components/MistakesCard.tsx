import React, { useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { homeTheme } from '../theme/homeTheme';

// Graceful no-op when expo-haptics is unavailable (web / stripped builds)
let Haptics: any = { impactAsync: async () => {}, ImpactFeedbackStyle: { Light: 'light' } };
try { Haptics = require('expo-haptics'); } catch { /* optional */ }

const PILLAR_LABEL: Record<string, string> = {
  pronunciation: 'pronunciation clarity',
  fluency: 'fluency',
  grammar: 'grammar',
  vocabulary: 'vocabulary',
};

interface MistakesCardProps {
  weakestPillar: string | null;
  detail?: string;
  onPractice: () => void;
}

export default function MistakesCard({ weakestPillar, detail, onPractice }: MistakesCardProps) {
  const scaleAnim = useRef(new Animated.Value(1)).current;

  if (!weakestPillar) {
    return null;
  }

  const label = PILLAR_LABEL[weakestPillar] ?? weakestPillar;
  const bodyText = detail ?? 'Last call showed room to grow — practice it now';

  const handlePressIn = () => {
    Animated.spring(scaleAnim, {
      toValue: homeTheme.pressScale,
      useNativeDriver: true,
      speed: 50,
      bounciness: 4,
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(scaleAnim, {
      toValue: 1,
      useNativeDriver: true,
      speed: 50,
      bounciness: 4,
    }).start();
  };

  const handlePracticePress = async () => {
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch { /* optional */ }
    onPractice();
  };

  return (
    <Animated.View style={[styles.card, { transform: [{ scale: scaleAnim }] }]}>
      <View style={styles.row}>
        {/* Icon tile */}
        <View style={styles.iconTile}>
          <Ionicons name="trending-up" size={20} color={homeTheme.action} />
        </View>

        {/* Text block */}
        <View style={styles.textBlock}>
          <Text style={styles.title} numberOfLines={2}>
            Improve your {label}
          </Text>
          <Text style={styles.body} numberOfLines={2}>
            {bodyText}
          </Text>
        </View>

        {/* CTA pill */}
        <TouchableOpacity
          style={styles.pill}
          onPress={handlePracticePress}
          onPressIn={handlePressIn}
          onPressOut={handlePressOut}
          activeOpacity={1}
        >
          <Text style={styles.pillText}>Practice now →</Text>
        </TouchableOpacity>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: homeTheme.cardFill,
    borderWidth: 1,
    borderColor: homeTheme.cardBorder,
    borderRadius: homeTheme.cardRadius,
    padding: homeTheme.cardPadding,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  iconTile: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: 'rgba(109,40,217,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  textBlock: {
    flex: 1,
    gap: 3,
  },
  title: {
    color: homeTheme.textTitle,
    fontSize: homeTheme.fontTitle,
    fontWeight: '600',
    lineHeight: 22,
  },
  body: {
    color: homeTheme.textBody,
    fontSize: homeTheme.fontBody,
    lineHeight: 19,
  },
  pill: {
    backgroundColor: homeTheme.action,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    flexShrink: 0,
  },
  pillText: {
    color: '#FFFFFF',
    fontSize: homeTheme.fontMeta,
    fontWeight: '600',
  },
});
