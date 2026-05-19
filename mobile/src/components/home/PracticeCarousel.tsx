import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Dimensions, FlatList } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useAppTheme } from '../../theme/useAppTheme';
import { tasksApi, type LearningTask } from '../../api/tasks';

const { width: SCREEN_W } = Dimensions.get('window');
const CARD_MARGIN = 20;
const CARD_W = SCREEN_W - CARD_MARGIN * 2;

const ICON: Record<string, keyof typeof Ionicons.glyphMap> = {
  pronunciation: 'mic',
  grammar: 'create',
  vocabulary: 'book',
};
const LABEL: Record<string, string> = {
  pronunciation: 'Pronunciation',
  grammar: 'Grammar',
  vocabulary: 'Vocabulary',
};

export default function PracticeCarousel({ fallback }: { fallback?: React.ReactNode }) {
  const theme = useAppTheme();
  const styles = getStyles(theme);
  const navigation = useNavigation<any>();
  const [tasks, setTasks] = useState<LearningTask[] | null>(null);
  const [active, setActive] = useState(0);
  const listRef = useRef<FlatList>(null);

  useEffect(() => {
    let alive = true;
    tasksApi
      .getDueTasks()
      .then((t) => {
        if (alive) setTasks(t);
      })
      .catch(() => {
        if (alive) setTasks([]);
      });
    return () => {
      alive = false;
    };
  }, []);

  if (tasks === null) return null;
  if (tasks.length === 0) {
    return <>{fallback ?? null}</>;
  }

  const renderCard = ({ item }: { item: LearningTask }) => {
    const c: any = item.content || {};
    return (
      <View style={styles.card}>
        <View style={styles.pillRow}>
          <View style={styles.pill}>
            <Ionicons name={ICON[item.type] || 'flash'} size={14} color={theme.colors.primary} />
            <Text style={styles.pillText}>{LABEL[item.type] || 'Practice'}</Text>
          </View>
          <Text style={styles.streak}>{item.correctStreak ?? 0}/2</Text>
        </View>
        <Text style={styles.said} numberOfLines={1}>
          You said: {c.userSaid || c.spoken || '—'}
        </Text>
        <Text style={styles.target} numberOfLines={2}>
          {c.target || c.correct}
        </Text>
        <TouchableOpacity
          style={styles.btn}
          onPress={() => navigation.navigate('PracticeTask', { task: item })}
        >
          <Text style={styles.btnText}>Practice</Text>
          <Ionicons name="arrow-forward" size={16} color="#fff" />
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <FlatList
        ref={listRef}
        data={tasks}
        renderItem={renderCard}
        keyExtractor={(t) => t.id}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        snapToInterval={CARD_W}
        decelerationRate="fast"
        onMomentumScrollEnd={(e) =>
          setActive(Math.round(e.nativeEvent.contentOffset.x / CARD_W))
        }
      />
      {tasks.length > 1 && (
        <View style={styles.dots}>
          {tasks.map((t, i) => (
            <View key={t.id} style={[styles.dot, i === active ? styles.dotOn : styles.dotOff]} />
          ))}
        </View>
      )}
    </View>
  );
}

const getStyles = (theme: any) =>
  StyleSheet.create({
    container: { gap: 8 },
    card: {
      width: CARD_W,
      padding: 16,
      borderRadius: 20,
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.colors.border,
      gap: 8,
    },
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
    pillText: { fontSize: 11, fontWeight: '700', color: theme.colors.primary },
    streak: { fontSize: 12, fontWeight: '700', color: theme.colors.text.secondary },
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
    dots: { flexDirection: 'row', justifyContent: 'center', gap: 6 },
    dot: { height: 4, borderRadius: 2 },
    dotOn: { width: 16, backgroundColor: theme.colors.primary },
    dotOff: { width: 4, backgroundColor: theme.colors.border },
  });
