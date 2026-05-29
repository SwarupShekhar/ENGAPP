import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  FlatList,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useAppTheme } from '../../theme/useAppTheme';
import { tasksApi, type LearningTask } from '../../api/tasks';
import { AnalyticsEvents } from '../../analytics/events';
import { useAnalytics } from '../../analytics/useAnalytics';

import { HomeSpeakCard, type CardState } from './HomeSpeakCard';
import { homePracticeApi } from '../../api/homePracticeApi';
import { useHomePracticeCapture } from '../../features/home/voice/useHomePracticeCapture';

const { width: SCREEN_W } = Dimensions.get('window');
const HPAD = 16;
const CARD_W = SCREEN_W - HPAD * 2;
const CAROUSEL_MIN_H = 248;

type Props = {
  phraseOfTheDay?: { phrase: string; definition: string; example: string } | null;
  wordOfTheDay?: { word: string; definition: string; example: string; partOfSpeech?: string | null } | null;
  dailyPracticeStatus?: {
    phrase: { done: boolean };
    word: { done: boolean };
  } | null;
  loadingPhrase?: boolean;
};

type PulseSlide =
  | { key: string; kind: 'phrase_daily'; phrase: { phrase: string; definition: string; example: string } }
  | { key: string; kind: 'word_daily'; word: { word: string; definition: string; example: string; partOfSpeech?: string | null } }
  | { key: string; kind: 'mistake_task'; task: LearningTask };

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function buildFormData(slide: PulseSlide, wavBytes: Uint8Array): FormData {
  const fd = new FormData();
  const blob = new Blob([wavBytes], { type: 'audio/wav' }) as any;
  fd.append('audio', blob, 'capture.wav');
  if (slide.kind === 'phrase_daily') {
    fd.append('cardType', 'phrase_daily');
    fd.append('referenceText', slide.phrase.phrase);
  } else if (slide.kind === 'word_daily') {
    fd.append('cardType', 'word_daily');
    fd.append('referenceText', slide.word.word);
  } else {
    fd.append('cardType', 'mistake_task');
    fd.append('taskId', slide.task.id);
    fd.append('referenceText', slide.task.content?.referenceText ?? slide.task.content?.target ?? '');
  }
  return fd;
}

export default function PulseHomeCarousel({
  phraseOfTheDay,
  wordOfTheDay,
  dailyPracticeStatus,
  loadingPhrase = false,
}: Props) {
  const theme = useAppTheme();
  const styles = getStyles(theme);
  const analytics = useAnalytics();
  const listRef = useRef<FlatList<PulseSlide>>(null);

  const [tasks, setTasks] = useState<LearningTask[] | null>(null);
  const [active, setActive] = useState(0);
  const [cardStates, setCardStates] = useState<Map<string, CardState>>(new Map());
  const trackedCarousel = useRef(false);
  const assessingLock = useRef(false);

  const capture = useHomePracticeCapture();

  // ── Load practice tasks on mount ────────────────────────────────────────────
  useEffect(() => {
    let alive = true;
    void (async () => {
      const t = await tasksApi.loadPracticeCarouselTasks();
      if (!alive) return;
      setTasks(t);
    })();
    return () => { alive = false; };
  }, []);

  // ── Refetch status on focus ──────────────────────────────────────────────────
  useFocusEffect(
    useCallback(() => {
      let alive = true;
      void (async () => {
        try {
          if (!homePracticeApi?.getStatus) return;
          const status = await homePracticeApi.getStatus();
          if (!alive || !status) return;
          setCardStates((prev) => {
            const next = new Map(prev);
            if (status.phrase?.done) next.set(`phrase-${todayKey()}`, 'done_today' as CardState);
            if (status.word?.done) next.set(`word-${todayKey()}`, 'done_today' as CardState);
            return next;
          });
        } catch {
          // best-effort
        }
      })();
      return () => { alive = false; };
    }, []),
  );

  // ── Build slide list ─────────────────────────────────────────────────────────
  const slides = useMemo<PulseSlide[]>(() => {
    const date = todayKey();
    const result: PulseSlide[] = [];

    if (phraseOfTheDay) {
      result.push({ key: `phrase-${date}`, kind: 'phrase_daily', phrase: phraseOfTheDay });
    }
    if (wordOfTheDay) {
      result.push({ key: `word-${date}`, kind: 'word_daily', word: wordOfTheDay });
    }
    for (const task of tasks ?? []) {
      result.push({ key: `practice-${task.id}`, kind: 'mistake_task', task });
    }
    return result;
  }, [phraseOfTheDay, wordOfTheDay, tasks]);

  // ── Fire carousel viewed once after slides are built ────────────────────────
  useEffect(() => {
    if (slides.length === 0 || trackedCarousel.current) return;
    trackedCarousel.current = true;
    analytics.capture(AnalyticsEvents.HOME_PRACTICE_CAROUSEL_VIEWED, {
      slide_count: slides.length,
      kinds: [...new Set(slides.map((s) => s.kind))],
    });
  }, [slides, analytics]);

  // ── Clamp active index ───────────────────────────────────────────────────────
  useEffect(() => {
    if (slides.length > 0 && active >= slides.length) {
      setActive(slides.length - 1);
    }
  }, [slides.length, active]);

  // ── Card state helpers ───────────────────────────────────────────────────────
  const setCardState = useCallback((key: string, state: CardState) => {
    setCardStates((prev) => {
      const next = new Map(prev);
      next.set(key, state);
      return next;
    });
  }, []);

  // ── Mic handlers ─────────────────────────────────────────────────────────────
  const handlePressIn = useCallback(async (slide: PulseSlide) => {
    if (assessingLock.current) return;
    analytics.capture(AnalyticsEvents.HOME_PRACTICE_RECORD_STARTED, { kind: slide.kind });
    setCardState(slide.key, 'recording' as CardState);
    try {
      await capture.start();
    } catch {
      setCardState(slide.key, 'ready' as CardState);
    }
  }, [analytics, capture, setCardState]);

  const handlePressOut = useCallback(async (slide: PulseSlide) => {
    analytics.capture(AnalyticsEvents.HOME_PRACTICE_RECORD_ENDED, { kind: slide.kind });
    if (assessingLock.current) return;

    let wavBytes: Uint8Array | null = null;
    try {
      const stopResult = await capture.stop();
      if (stopResult.tooShort || !stopResult.wavBytes) {
        setCardState(slide.key, 'ready' as CardState);
        return;
      }
      wavBytes = stopResult.wavBytes;
    } catch {
      setCardState(slide.key, 'ready' as CardState);
      return;
    }

    assessingLock.current = true;
    setCardState(slide.key, 'assessing' as CardState);

    try {
      const fd = buildFormData(slide, wavBytes);
      const result = await homePracticeApi.assess(fd);

      analytics.capture(AnalyticsEvents.HOME_PRACTICE_ASSESS_COMPLETED, {
        kind: slide.kind,
        pass: result.pass,
        doneForToday: result.doneForToday,
      });

      if (result.pass && result.doneForToday) {
        setCardState(slide.key, 'done_today' as CardState);
        if (slide.kind === 'phrase_daily' || slide.kind === 'word_daily') {
          analytics.capture(AnalyticsEvents.HOME_PRACTICE_DAILY_COMPLETED, { kind: slide.kind });
        }
      } else if (result.pass && !result.doneForToday) {
        setCardState(slide.key, 'pass_partial' as CardState);
        if (slide.kind === 'mistake_task') {
          analytics.capture(AnalyticsEvents.HOME_PRACTICE_MISTAKE_STREAK_UPDATED, {
            taskId: slide.task.id,
            correctStreak: result.correctStreak,
          });
        }
        setTimeout(() => { setCardState(slide.key, 'ready' as CardState); }, 1500);
      } else {
        setCardState(slide.key, 'fail' as CardState);
        setTimeout(() => { setCardState(slide.key, 'ready' as CardState); }, 1500);
      }
    } catch {
      setCardState(slide.key, 'fail' as CardState);
      setTimeout(() => { setCardState(slide.key, 'ready' as CardState); }, 1500);
    } finally {
      assessingLock.current = false;
    }
  }, [analytics, capture, setCardState]);

  const onMomentumScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    setActive(Math.round(e.nativeEvent.contentOffset.x / CARD_W));
  };

  if (loadingPhrase && tasks === null) {
    const tint = `${theme.colors.primary}22`;
    return (
      <View style={[styles.card, styles.skeletonCard]}>
        {[120, '72%', '100%', '88%', '100%'].map((w, i) => (
          <View key={i} style={[styles.skelBar, { width: w as any, backgroundColor: tint, height: i === 1 ? 22 : i === 3 ? 48 : i === 4 ? 44 : 12 }]} />
        ))}
      </View>
    );
  }

  if (slides.length === 0) {
    return (
      <View style={styles.container}>
        <View style={[styles.card, { justifyContent: 'center', alignItems: 'center', minHeight: CAROUSEL_MIN_H }]}>
          <Text style={styles.hint}>No cards right now. Complete a call to unlock practice cards.</Text>
        </View>
      </View>
    );
  }

  const renderSlide = ({ item }: { item: PulseSlide }) => {
    const date = todayKey();
    let effectiveState: CardState = cardStates.get(item.key) ?? ('ready' as CardState);
    if (item.key === `phrase-${date}` && dailyPracticeStatus?.phrase.done) effectiveState = 'done_today' as CardState;
    if (item.key === `word-${date}` && dailyPracticeStatus?.word.done) effectiveState = 'done_today' as CardState;

    const streakForTask = item.kind === 'mistake_task' ? `${item.task.correctStreak ?? 0}/2` : undefined;
    const pillLabel = item.kind === 'phrase_daily' ? 'Phrase of the day' : item.kind === 'word_daily' ? 'Word of the day' : 'Practice mistake';
    const pillColor = item.kind === 'phrase_daily' ? theme.colors.warning : theme.colors.primary;
    const doneMessage = item.kind !== 'mistake_task' ? 'Great — see you tomorrow' : undefined;

    return (
      <View style={{ width: CARD_W }}>
        <HomeSpeakCard
          cardState={effectiveState}
          pillLabel={pillLabel}
          pillColor={pillColor}
          doneMessage={doneMessage}
          badge={streakForTask}
          onMicPressIn={() => void handlePressIn(item)}
          onMicPressOut={() => void handlePressOut(item)}
        >
          {item.kind === 'phrase_daily' && (
            <>
              <Text style={styles.target}>{item.phrase.phrase}</Text>
              <Text style={styles.said}>{item.phrase.definition}</Text>
              <View style={styles.quoteBlock}>
                <Text style={styles.quoteText}>"{item.phrase.example}"</Text>
              </View>
            </>
          )}
          {item.kind === 'word_daily' && (
            <>
              <Text style={styles.target}>{item.word.word}</Text>
              {item.word.partOfSpeech ? (
                <Text style={styles.eyebrow}>{item.word.partOfSpeech}</Text>
              ) : null}
              <Text style={styles.said}>{item.word.definition}</Text>
              <View style={styles.quoteBlock}>
                <Text style={styles.quoteText}>"{item.word.example}"</Text>
              </View>
            </>
          )}
          {item.kind === 'mistake_task' && (
            <>
              <Text style={styles.eyebrow}>From your last call</Text>
              <Text style={styles.said} numberOfLines={1}>
                You said: {item.task.content?.userSaid ?? '—'}
              </Text>
              <Text style={styles.target} numberOfLines={3}>
                {item.task.content?.target ?? item.task.title}
              </Text>
            </>
          )}
        </HomeSpeakCard>
      </View>
    );
  };

  return (
    <View style={styles.container}>
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


const getStyles = (theme: ReturnType<typeof useAppTheme>) =>
  StyleSheet.create({
    container: { gap: 8 },
    hint: {
      fontSize: 12,
      color: theme.colors.text.secondary,
      textAlign: 'center',
      marginBottom: 4,
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
    eyebrow: {
      fontSize: 11,
      fontWeight: '600',
      color: theme.colors.text.light,
      letterSpacing: 0.2,
    },
    said: { fontSize: 12, color: theme.colors.text.secondary },
    target: { fontSize: 17, fontWeight: '800', color: theme.colors.text.primary },
    quoteBlock: {
      borderLeftWidth: 3,
      borderLeftColor: theme.colors.primary,
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
    dots: { flexDirection: 'row', justifyContent: 'center', gap: 6 },
    dot: { height: 4, borderRadius: 2 },
    dotOn: { width: 16, backgroundColor: theme.colors.primary },
    dotOff: { width: 4, backgroundColor: theme.colors.border },
  });
