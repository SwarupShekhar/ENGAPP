import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  FlatList,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import { useAppTheme } from '../../theme/useAppTheme';
import { tasksApi, type LearningTask } from '../../api/tasks';
import { AnalyticsEvents } from '../../analytics/events';
import { useAnalytics } from '../../analytics/useAnalytics';

const { width: SCREEN_W } = Dimensions.get('window');
const HPAD = 16;
const CARD_W = SCREEN_W - HPAD * 2;
const CAROUSEL_MIN_H = 248;

export type PulsePhrase = {
  id?: string;
  phrase: string;
  definition: string;
  example: string;
};

type PulseSlide =
  | { key: string; kind: 'practice'; task: LearningTask }
  | { key: string; kind: 'phrase'; phrase: PulsePhrase };

const PRACTICE_ICON: Record<string, keyof typeof Ionicons.glyphMap> = {
  pronunciation: 'mic',
  grammar: 'create',
  vocabulary: 'book',
};
const PRACTICE_LABEL: Record<string, string> = {
  pronunciation: 'Pronunciation',
  grammar: 'Grammar',
  vocabulary: 'Vocabulary',
};

type Props = {
  phrase: PulsePhrase | null;
  loadingPhrase?: boolean;
};

export default function PulseHomeCarousel({ phrase, loadingPhrase = false }: Props) {
  const theme = useAppTheme();
  const styles = getStyles(theme);
  const navigation = useNavigation<any>();
  const analytics = useAnalytics();
  const listRef = useRef<FlatList<PulseSlide>>(null);

  const [tasks, setTasks] = useState<LearningTask[] | null>(null);
  const [active, setActive] = useState(0);
  const trackedCarousel = useRef(false);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const t = await tasksApi.loadPracticeCarouselTasks();
      if (!alive) return;
      setTasks(t);
      if (!trackedCarousel.current) {
        trackedCarousel.current = true;
        analytics.capture(AnalyticsEvents.PRACTICE_CAROUSEL_VIEWED, {
          due_count: t.length,
          types: [...new Set(t.map((x) => x.type))],
          unified_carousel: true,
        });
      }
    })();
    return () => {
      alive = false;
    };
  }, [analytics]);

  const phraseReady = !loadingPhrase && phrase != null;
  const tasksLoading = tasks === null;

  const slides = useMemo<PulseSlide[]>(() => {
    if (!phrase) return [];
    // Phrase first (local, instant) — tasks append so index 0 never shifts on load
    return [
      { key: `phrase-${phrase.id ?? 'pod'}`, kind: 'phrase', phrase },
      ...(tasks ?? []).map((task): PulseSlide => ({
        key: `practice-${task.id}`,
        kind: 'practice',
        task,
      })),
    ];
  }, [tasks, phrase]);

  // Clamp active index if slides shrink (safety guard)
  useEffect(() => {
    if (slides.length > 0 && active >= slides.length) {
      setActive(slides.length - 1);
    }
  }, [slides.length]);

  if (!phraseReady) {
    return <CarouselSkeleton theme={theme} styles={styles} />;
  }

  const onMomentumScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    setActive(Math.round(e.nativeEvent.contentOffset.x / CARD_W));
  };

  const renderPractice = (item: LearningTask) => {
    const c: { userSaid?: string; spoken?: string; target?: string; correct?: string } =
      item.content || {};
    const userSaid = c.userSaid || c.spoken || '—';
    const target = c.target || c.correct || item.title || 'Practice this correction';

    return (
      <View style={styles.card}>
        <View style={styles.pillRow}>
          <View style={styles.pill}>
            <Ionicons
              name={PRACTICE_ICON[item.type] || 'flash'}
              size={14}
              color={theme.colors.primary}
            />
            <Text style={styles.pillText}>{PRACTICE_LABEL[item.type] || 'Practice'}</Text>
          </View>
          <Text style={styles.streak}>{item.correctStreak ?? 0}/2</Text>
        </View>
        <Text style={styles.eyebrow}>From your last call</Text>
        <Text style={styles.said} numberOfLines={1}>
          You said: {userSaid}
        </Text>
        <Text style={styles.target} numberOfLines={2}>
          {target}
        </Text>
        <TouchableOpacity
          style={styles.btn}
          onPress={() => {
            analytics.capture(AnalyticsEvents.PRACTICE_TASK_OPENED, {
              task_id: item.id,
              task_type: item.type,
              source: 'unified_carousel',
            });
            navigation.navigate('PracticeTask', { task: item });
          }}
        >
          <Text style={styles.btnText}>Practice</Text>
          <Ionicons name="arrow-forward" size={16} color="#fff" />
        </TouchableOpacity>
      </View>
    );
  };

  const renderPhrase = (p: PulsePhrase) => (
    <View style={styles.card}>
      <View style={styles.pillRow}>
        <View style={[styles.pill, styles.phrasePill]}>
          <Ionicons name="chatbubble-ellipses" size={14} color={theme.colors.warning} />
          <Text style={[styles.pillText, { color: theme.colors.warning }]}>Phrase of the day</Text>
        </View>
      </View>
      <Text style={styles.target} numberOfLines={2}>
        {p.phrase}
      </Text>
      <Text style={styles.said} numberOfLines={2}>
        {p.definition}
      </Text>
      <View style={[styles.quoteBlock, { borderLeftColor: theme.colors.primary }]}>
        <Text style={styles.quoteText} numberOfLines={3}>
          "{p.example}"
        </Text>
      </View>
      <TouchableOpacity
        activeOpacity={0.82}
        onPress={() =>
          navigation.navigate('MayaTutor', { phrase: p, source: 'phrase_of_day' })
        }
        style={{ borderRadius: theme.borderRadius.m, overflow: 'hidden' }}
      >
        <LinearGradient
          colors={theme.colors.gradients.primary as [string, string, ...string[]]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.phraseBtn}
        >
          <Ionicons name="mic" size={14} color="#fff" style={{ marginRight: 6 }} />
          <Text style={styles.phraseBtnText}>Practice it</Text>
        </LinearGradient>
      </TouchableOpacity>
    </View>
  );

  const renderSlide = ({ item }: { item: PulseSlide }) => (
    <View style={{ width: CARD_W }}>
      {item.kind === 'practice' ? renderPractice(item.task) : renderPhrase(item.phrase)}
    </View>
  );

  return (
    <View style={styles.container}>
      {tasksLoading ? (
        <View style={styles.stateCard}>
          <Ionicons name="hourglass-outline" size={16} color={theme.colors.text.secondary} />
          <Text style={styles.stateTitle}>Preparing your practice queue</Text>
          <Text style={styles.stateHint}>Fetching your latest corrections…</Text>
        </View>
      ) : null}
      {slides.length === 0 ? (
        <View style={[styles.card, { justifyContent: 'center', alignItems: 'center', minHeight: CAROUSEL_MIN_H }]}>
          <Text style={styles.hint}>No cards right now. Complete a call to unlock practice cards.</Text>
        </View>
      ) : (
        <FlatList
          ref={listRef}
          data={slides}
          renderItem={renderSlide}
          keyExtractor={(s) => s.key}
          horizontal
          showsHorizontalScrollIndicator={false}
          snapToInterval={CARD_W}
          snapToAlignment="start"
          decelerationRate="fast"
          onMomentumScrollEnd={onMomentumScrollEnd}
          getItemLayout={(_, index) => ({
            length: CARD_W,
            offset: CARD_W * index,
            index,
          })}
        />
      )}
      {slides.length > 1 ? (
        <View style={styles.dots}>
          {slides.map((s, i) => (
            <View key={s.key} style={[styles.dot, i === active ? styles.dotOn : styles.dotOff]} />
          ))}
        </View>
      ) : null}
    </View>
  );
}

function CarouselSkeleton({
  theme,
  styles,
}: {
  theme: ReturnType<typeof useAppTheme>;
  styles: ReturnType<typeof getStyles>;
}) {
  const tint = `${theme.colors.primary}22`;
  return (
    <View style={[styles.card, styles.skeletonCard]}>
      <View style={[styles.skelBar, { width: 120, backgroundColor: tint }]} />
      <View style={[styles.skelBar, { width: '72%', height: 22, backgroundColor: tint }]} />
      <View style={[styles.skelBar, { width: '100%', backgroundColor: tint }]} />
      <View style={[styles.skelBar, { width: '88%', height: 48, backgroundColor: tint }]} />
      <View style={[styles.skelBar, { width: '100%', height: 44, backgroundColor: tint }]} />
    </View>
  );
}

const getStyles = (theme: ReturnType<typeof useAppTheme>) =>
  StyleSheet.create({
    container: { gap: 8 },
    hint: {
      fontSize: 12,
      color: theme.colors.text.secondary,
      textAlign: 'center',
      marginBottom: 4,
    },
    stateCard: {
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: 14,
      paddingVertical: 10,
      paddingHorizontal: 12,
      backgroundColor: `${theme.colors.surface}EE`,
      alignItems: 'center',
      gap: 4,
      marginBottom: 4,
    },
    stateTitle: {
      fontSize: 12,
      fontWeight: '700',
      color: theme.colors.text.primary,
      textAlign: 'center',
    },
    stateHint: {
      fontSize: 11,
      color: theme.colors.text.secondary,
      textAlign: 'center',
    },
    retryButton: {
      marginTop: 4,
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 999,
      backgroundColor: `${theme.colors.primary}20`,
    },
    retryButtonText: {
      fontSize: 11,
      fontWeight: '700',
      color: theme.colors.primary,
    },
    card: {
      width: CARD_W,
      minHeight: CAROUSEL_MIN_H,
      padding: 16,
      borderRadius: 20,
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.colors.border,
      gap: 8,
      justifyContent: 'space-between',
    },
    skeletonCard: { justifyContent: 'flex-start' },
    skelBar: { height: 12, borderRadius: 6 },
    pillRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    pill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: `${theme.colors.primary}14`,
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 12,
    },
    phrasePill: { backgroundColor: `${theme.colors.warning}18` },
    pillText: { fontSize: 11, fontWeight: '700', color: theme.colors.primary },
    streak: { fontSize: 12, fontWeight: '700', color: theme.colors.text.secondary },
    eyebrow: {
      fontSize: 11,
      fontWeight: '600',
      color: theme.colors.text.light,
      letterSpacing: 0.2,
    },
    said: { fontSize: 12, color: theme.colors.text.secondary },
    target: { fontSize: 17, fontWeight: '800', color: theme.colors.text.primary },
    btn: {
      marginTop: 4,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      paddingVertical: 10,
      borderRadius: 12,
      backgroundColor: theme.colors.primary,
    },
    btnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
    quoteBlock: {
      borderLeftWidth: 3,
      paddingLeft: 12,
      paddingVertical: 8,
      backgroundColor: `${theme.colors.primary}0E`,
      borderRadius: theme.borderRadius.s,
    },
    quoteText: {
      fontStyle: 'italic',
      fontSize: theme.typography.sizes.s,
      color: theme.colors.text.secondary,
      lineHeight: 20,
    },
    phraseBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 13,
      borderRadius: 10,
    },
    phraseBtnText: { color: '#fff', fontWeight: '700', fontSize: theme.typography.sizes.m },
    dots: { flexDirection: 'row', justifyContent: 'center', gap: 6 },
    dot: { height: 4, borderRadius: 2 },
    dotOn: { width: 16, backgroundColor: theme.colors.primary },
    dotOff: { width: 4, backgroundColor: theme.colors.border },
  });
