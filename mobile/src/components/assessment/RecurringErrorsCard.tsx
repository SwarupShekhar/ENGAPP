import React from 'react';
import { View, Text, StyleSheet, FlatList } from 'react-native';
import { theme } from '../../theme/theme';
import { MaterialCommunityIcons } from '@expo/vector-icons';

interface ErrorPattern {
  id: string;
  errorType: string;
  errorCategory: string;
  occurrenceCount: number;
  status: string;
}

interface Props {
  patterns: ErrorPattern[];
}

export const RecurringErrorsCard: React.FC<Props> = ({ patterns }) => {
  if (!patterns || patterns.length === 0) return null;

  const renderItem = ({ item }: { item: ErrorPattern }) => {
    const isImproving = item.status === 'IMPROVING';
    
    return (
      <View style={styles.errorRow}>
        <View style={styles.errorInfo}>
          <Text style={styles.errorLabel}>{item.errorType.replace(/_/g, ' ')}</Text>
          <Text style={styles.categoryLabel}>{item.errorCategory}</Text>
        </View>
        
        <View style={styles.statsInfo}>
          <Text style={styles.countText}>{item.occurrenceCount}x detected</Text>
          <View style={[styles.statusBadge, { backgroundColor: isImproving ? theme.colors.success + '20' : theme.colors.warning + '20' }]}>
            <Text style={[styles.statusText, { color: isImproving ? theme.colors.success : theme.colors.warning }]}>
              {item.status}
            </Text>
          </View>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <MaterialCommunityIcons name="alert-decagram" size={24} color={theme.colors.error} />
        <Text style={styles.title}>Persistent Patterns</Text>
      </View>
      
      <Text style={styles.subtitle}>Recurring errors detected across multiple phases</Text>

      {patterns.map((p) => (
        <View key={p.id}>{renderItem({ item: p })}</View>
      ))}

      <View style={styles.infoBox}>
        <MaterialCommunityIcons name="lightbulb-on" size={16} color={theme.colors.primary} />
        <Text style={styles.infoText}>
          Targeting these patterns in practice will accelerate your CEFR progression.
        </Text>
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
    borderColor: theme.colors.error + '20',
    ...theme.shadows.small,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  title: {
    fontSize: theme.typography.sizes.m,
    fontWeight: 'bold',
    color: theme.colors.text.primary,
  },
  subtitle: {
    fontSize: theme.typography.sizes.xs,
    color: theme.colors.text.secondary,
    marginBottom: theme.spacing.m,
  },
  errorRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: theme.spacing.s,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border + '10',
  },
  errorInfo: {
    flex: 1,
  },
  errorLabel: {
    fontSize: theme.typography.sizes.s,
    fontWeight: '500',
    color: theme.colors.text.primary,
    textTransform: 'capitalize',
  },
  categoryLabel: {
    fontSize: theme.typography.sizes.xs,
    color: theme.colors.text.light,
  },
  statsInfo: {
    alignItems: 'flex-end',
  },
  countText: {
    fontSize: theme.typography.sizes.xs,
    color: theme.colors.text.secondary,
    marginBottom: 4,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  statusText: {
    fontSize: 10,
    fontWeight: 'bold',
  },
  infoBox: {
    flexDirection: 'row',
    backgroundColor: theme.colors.primary + '10',
    padding: theme.spacing.s,
    borderRadius: theme.borderRadius.s,
    marginTop: theme.spacing.m,
    alignItems: 'center',
    gap: 8,
  },
  infoText: {
    fontSize: theme.typography.sizes.xs,
    color: theme.colors.text.primary,
    flex: 1,
  },
});
