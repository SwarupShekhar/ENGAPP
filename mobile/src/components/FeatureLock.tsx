import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

interface FeatureLockProps {
  feature?: string; // Optional name for display or logging
  currentLevel: number;
  requiredLevel: number;
}

export const FeatureLock: React.FC<FeatureLockProps> = ({ feature, currentLevel, requiredLevel }) => (
  <View style={styles.lockOverlay}>
    <Text style={styles.lockIcon}>🔒</Text>
    <Text style={styles.lockText}>
      Unlock at Level {requiredLevel}
    </Text>
    <Text style={styles.lockSubtext}>
      {Math.max(0, requiredLevel - currentLevel)} more levels to go!
    </Text>
  </View>
);

const styles = StyleSheet.create({
  lockOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
    borderRadius: 8,
  },
  lockIcon: {
    fontSize: 32,
    marginBottom: 8,
  },
  lockText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  lockSubtext: {
    color: '#ccc',
    fontSize: 14,
  },
});
