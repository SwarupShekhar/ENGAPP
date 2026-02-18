import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { theme } from '../theme/theme';
import { Ionicons } from '@expo/vector-icons';
// import { sessionsApi } from '../api/sessions'; 

interface RouteParams {
  sessionId: string;
  structure: {
    topic: string;
    duration: number;
    objectives: string[];
  };
  partnerName: string;
  partnerId: string;
}

export default function SessionCommitmentScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute();
  const { sessionId, structure, partnerName } = route.params as RouteParams;
  const [agreedToObjectives, setAgreedToObjectives] = useState(false);

  const handleCommit = async () => {
    try {
      // await sessionsApi.commitToSession(sessionId);
      // For now, navigate directly. Backend commitment can be added later or implied by joining.
      navigation.replace('InCall', { sessionId, ...route.params });
    } catch (error) {
      console.error('Failed to commit:', error);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>📋 Session Plan</Text>
      <Text style={styles.subtitle}>with {partnerName}</Text>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>{structure?.topic || 'Structured Session'}</Text>
        <Text style={styles.duration}>⏱️ {structure?.duration || 10} minutes</Text>

        <Text style={styles.sectionTitle}>Your Goals:</Text>
        {structure?.objectives?.map((obj, i) => (
          <View key={i} style={styles.objective}>
            <Ionicons name="checkmark-circle" size={20} color={theme.colors.success} style={{ marginTop: 2 }} />
            <Text style={styles.objectiveText}>{obj}</Text>
          </View>
        ))}

        <View style={styles.noteContainer}>
          <Text style={styles.note}>
            💡 You'll both get feedback on how well you met these goals
          </Text>
        </View>
      </View>

      <TouchableOpacity
        style={[styles.checkbox, agreedToObjectives && styles.checkboxChecked]}
        onPress={() => setAgreedToObjectives(!agreedToObjectives)}
        activeOpacity={0.8}
      >
        <Ionicons 
            name={agreedToObjectives ? "checkbox" : "square-outline"} 
            size={24} 
            color={agreedToObjectives ? theme.colors.primary : theme.colors.text.secondary} 
            style={{ marginRight: 12 }}
        />
        <Text style={styles.checkboxText}>
          I commit to trying my best for the full {structure?.duration} minutes
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.startBtn, !agreedToObjectives && styles.startBtnDisabled]}
        onPress={handleCommit}
        disabled={!agreedToObjectives}
      >
        <Text style={styles.startBtnText}>Start Session →</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
        <Text style={styles.backBtnText}>Find Different Partner</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  content: { padding: 20, paddingTop: 60 },
  title: { fontSize: 28, fontWeight: '800', color: theme.colors.text.primary, marginBottom: 4 },
  subtitle: { fontSize: 16, color: theme.colors.text.secondary, marginBottom: 24 },
  card: {
    backgroundColor: '#f8f9ff',
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  cardTitle: { fontSize: 20, fontWeight: '700', color: theme.colors.text.primary, marginBottom: 4 },
  duration: { fontSize: 14, color: theme.colors.primary, marginBottom: 16, fontWeight: '600' },
  sectionTitle: { fontSize: 15, fontWeight: '600', color: theme.colors.text.primary, marginBottom: 12 },
  objective: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 12, gap: 8 },
  objectiveText: { flex: 1, fontSize: 14, color: theme.colors.text.secondary, lineHeight: 20 },
  noteContainer: {
    backgroundColor: theme.colors.primary + '10',
    borderRadius: 8,
    padding: 12,
    marginTop: 12,
    borderWidth: 1,
    borderColor: theme.colors.primary + '30',
  },
  note: {
    fontSize: 13,
    color: theme.colors.primary,
    fontWeight: '500',
  },
  checkbox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f1f5f9',
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
    borderWidth: 2,
    borderColor: '#e2e8f0',
  },
  checkboxChecked: {
    backgroundColor: theme.colors.primary + '08',
    borderColor: theme.colors.primary,
  },
  checkboxText: { flex: 1, fontSize: 14, color: theme.colors.text.primary, fontWeight: '600' },
  startBtn: {
    backgroundColor: theme.colors.primary,
    borderRadius: 14,
    paddingVertical: 18,
    alignItems: 'center',
    marginBottom: 16,
    ...theme.shadows.primaryGlow,
  },
  startBtnDisabled: { backgroundColor: '#cbd5e1', shadowOpacity: 0 },
  startBtnText: { fontSize: 16, fontWeight: '700', color: '#fff' },
  backBtn: { alignItems: 'center', paddingVertical: 12 },
  backBtnText: { fontSize: 14, color: theme.colors.text.secondary, fontWeight: '500' },
});
