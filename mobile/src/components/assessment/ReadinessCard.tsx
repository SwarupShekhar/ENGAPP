import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { theme } from '../../theme/theme';
import { MaterialCommunityIcons } from '@expo/vector-icons';

interface Props {
  data: {
    canDo: string[];
    mayStruggleWith: string[];
    careerGoalAlignment: {
      current: string;
      target: string;
      gap: number;
      estimatedTimeToTarget: string;
    };
  };
}

export const ReadinessCard: React.FC<Props> = ({ data }) => {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Real-World Readiness</Text>
      
      {/* Target Alignment */}
      <View style={styles.alignmentBox}>
        <View style={styles.alignmentHeader}>
          <MaterialCommunityIcons name="briefcase-check" size={20} color={theme.colors.primary} />
          <Text style={styles.alignmentTitle}>Engineering Role Target</Text>
        </View>
        <View style={styles.alignmentStats}>
          <View>
            <Text style={styles.label}>Current State</Text>
            <Text style={styles.statsValue}>{data.careerGoalAlignment.current}</Text>
          </View>
          <View style={styles.divider} />
          <View>
            <Text style={styles.label}>Roadmap</Text>
            <Text style={[styles.statsValue, { color: theme.colors.primary }]}>
              {data.careerGoalAlignment.estimatedTimeToTarget}
            </Text>
          </View>
        </View>
      </View>

      {/* Capabilities */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Global Capabilities</Text>
        {data.canDo.slice(0, 3).map((ability, idx) => (
          <View key={idx} style={styles.checkRow}>
            <MaterialCommunityIcons name="check-circle" size={16} color={theme.colors.success} />
            <Text style={styles.abilityText}>{ability}</Text>
          </View>
        ))}
      </View>

      {/* Constraints */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>High-Stress Constraints</Text>
        {data.mayStruggleWith.map((struggle, idx) => (
          <View key={idx} style={styles.struggleRow}>
            <MaterialCommunityIcons name="alert-circle-outline" size={16} color={theme.colors.warning} />
            <Text style={styles.struggleText}>{struggle}</Text>
          </View>
        ))}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.m,
    padding: theme.spacing.m,
    marginVertical: theme.spacing.s,
    borderWidth: 1,
    borderColor: theme.colors.primary + '20',
    ...theme.shadows.small,
  },
  title: {
    fontSize: theme.typography.sizes.m,
    fontWeight: 'bold',
    color: theme.colors.text.primary,
    marginBottom: theme.spacing.m,
  },
  alignmentBox: {
    backgroundColor: theme.colors.background,
    borderRadius: theme.borderRadius.s,
    padding: theme.spacing.m,
    marginBottom: theme.spacing.l,
    borderWidth: 1,
    borderColor: theme.colors.border + '10',
  },
  alignmentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: theme.spacing.s,
  },
  alignmentTitle: {
    fontSize: theme.typography.sizes.s,
    fontWeight: 'bold',
    color: theme.colors.text.primary,
  },
  alignmentStats: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: theme.spacing.s,
  },
  divider: {
    width: 1,
    height: 30,
    backgroundColor: theme.colors.border + '20',
  },
  label: {
    fontSize: 10,
    color: theme.colors.text.light,
    textTransform: 'uppercase',
  },
  statsValue: {
    fontSize: theme.typography.sizes.s,
    fontWeight: 'bold',
    color: theme.colors.text.primary,
  },
  section: {
    marginBottom: theme.spacing.m,
  },
  sectionTitle: {
    fontSize: theme.typography.sizes.xs,
    fontWeight: 'bold',
    color: theme.colors.text.secondary,
    marginBottom: theme.spacing.s,
    textTransform: 'uppercase',
  },
  checkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  abilityText: {
    fontSize: theme.typography.sizes.s,
    color: theme.colors.text.primary,
  },
  struggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  struggleText: {
    fontSize: theme.typography.sizes.s,
    color: theme.colors.text.secondary,
  },
});
