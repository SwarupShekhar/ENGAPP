import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import type { LatencyTrace } from '../../utils/latencyTimeline';

type Props = {
  trace: LatencyTrace | null;
  extra?: string;
};

export function LatencyTimelinePanel({ trace, extra }: Props) {
  if (!__DEV__ || !trace) return null;

  const rows = [...trace.spans].sort((a, b) => a.startMs - b.startMs);

  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>
        latency • {trace.journey} • {trace.traceId.slice(0, 18)}…
      </Text>
      {extra ? <Text style={styles.extra}>{extra}</Text> : null}
      <ScrollView style={styles.scroll} nestedScrollEnabled>
        {rows.map((s, i) => (
          <Text key={`${s.name}-${i}`} style={styles.row}>
            {s.durationMs != null && s.durationMs > 0
              ? `${s.name} +${Math.round(s.startMs)}ms (${Math.round(s.durationMs)}ms)`
              : `${s.name} +${Math.round(s.startMs)}ms`}
          </Text>
        ))}
        {trace.serverTimings &&
          Object.entries(trace.serverTimings).map(([k, v]) => (
            <Text key={`srv-${k}`} style={styles.serverRow}>
              server.{k} @ {Math.round(v)}ms
            </Text>
          ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginTop: 8,
    maxHeight: 140,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: 8,
    padding: 8,
    width: '100%',
  },
  title: { color: '#a5f3fc', fontSize: 10, fontWeight: '700', marginBottom: 4 },
  extra: { color: '#94a3b8', fontSize: 10, marginBottom: 4 },
  scroll: { maxHeight: 100 },
  row: { color: '#e2e8f0', fontSize: 10, fontFamily: 'monospace', lineHeight: 14 },
  serverRow: { color: '#86efac', fontSize: 10, fontFamily: 'monospace', lineHeight: 14 },
});
