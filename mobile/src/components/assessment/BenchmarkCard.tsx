import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { theme } from '../../theme/theme';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';

interface Props {
  data: {
    currentScore: number;
    cefr: string;
    peerGroup: {
      average: number;
      stddev: number;
      size: number;
    };
    percentile: number;
    cefrRange: { min: number; max: number };
  };
}

export const BenchmarkCard: React.FC<Props> = ({ data }) => {
  const isAboveAverage = data.currentScore >= data.peerGroup.average;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Comparative Intelligence</Text>
      
      <View style={styles.grid}>
        {/* Peer Comparison */}
        <View style={styles.statBox}>
          <Text style={styles.label}>Vs Peer Average</Text>
          <View style={styles.row}>
            <Text style={[styles.value, { color: isAboveAverage ? theme.colors.success : theme.colors.warning }]}>
              {isAboveAverage ? '+' : ''}{data.currentScore - data.peerGroup.average}
            </Text>
            <MaterialCommunityIcons 
              name={isAboveAverage ? "trending-up" : "trending-down"} 
              size={20} 
              color={isAboveAverage ? theme.colors.success : theme.colors.warning} 
            />
          </View>
          <Text style={styles.sublabel}>Across {data.peerGroup.size} peers</Text>
        </View>

        {/* Percentile */}
        <View style={styles.statBox}>
          <Text style={styles.label}>Global Percentile</Text>
          <Text style={styles.value}>{data.percentile}th</Text>
          <Text style={styles.sublabel}>Top {100 - data.percentile}% of learners</Text>
        </View>
      </View>

      <View style={styles.rangeContainer}>
        <Text style={styles.label}>{data.cefr} Level Context</Text>
        <View style={styles.progressBarBg}>
          <LinearGradient
            colors={theme.colors.gradients.primary as any}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={[
              styles.progressBarFill,
              { width: `${data.currentScore}%` }
            ]}
          />
          {/* CEFR Markers */}
          <View style={[styles.cefrMarker, { left: `${data.cefrRange.min}%` }]}>
             <View style={styles.markerLine} />
             <Text style={styles.markerLabel}>{data.cefr} Min</Text>
          </View>
        </View>
        <Text style={styles.sublabel}>
          Your performance is {data.currentScore >= data.cefrRange.max ? 'exceeding' : 'within'} the expected {data.cefr} band.
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
    borderColor: theme.colors.border + '20',
    ...theme.shadows.small,
  },
  title: {
    fontSize: theme.typography.sizes.m,
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.text.primary,
    marginBottom: theme.spacing.m,
  },
  grid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: theme.spacing.l,
  },
  statBox: {
    flex: 1,
    paddingRight: theme.spacing.s,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  label: {
    fontSize: theme.typography.sizes.xs,
    color: theme.colors.text.secondary,
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  value: {
    fontSize: theme.typography.sizes.l,
    fontWeight: theme.typography.weights.black,
    color: theme.colors.text.primary,
  },
  sublabel: {
    fontSize: theme.typography.sizes.xs,
    color: theme.colors.text.light,
    marginTop: 2,
  },
  rangeContainer: {
    marginTop: theme.spacing.s,
  },
  progressBarBg: {
    height: 12,
    backgroundColor: '#E2E8F0',
    borderRadius: 6,
    marginVertical: theme.spacing.s,
    position: 'relative',
    overflow: 'visible',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 6,
  },
  cefrMarker: {
    position: 'absolute',
    top: -4,
    height: 20,
    alignItems: 'center',
  },
  markerLine: {
    width: 2,
    height: 20,
    backgroundColor: theme.colors.secondary,
  },
  markerLabel: {
    fontSize: 8,
    color: theme.colors.secondary,
    marginTop: 4,
    fontWeight: 'bold',
  },
});
