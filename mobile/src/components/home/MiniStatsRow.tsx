import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { theme } from '../../theme/theme';
import { Ionicons } from '@expo/vector-icons';

interface MiniStatsRowProps {
    conversations: number;
    words: number;
    level: string;
}

export function MiniStatsRow({ conversations, words, level }: MiniStatsRowProps) {
    return (
        <View style={styles.container}>
            <View style={styles.card}>
                <Ionicons name="chatbubbles-outline" size={20} color={theme.colors.primary} style={styles.icon} />
                <Text style={styles.value}>{conversations}</Text>
                <Text style={styles.label}>Calls</Text>
            </View>
            <View style={styles.card}>
                <Ionicons name="book-outline" size={20} color={theme.colors.secondary} style={styles.icon} />
                <Text style={styles.value}>{words}</Text>
                <Text style={styles.label}>Words</Text>
            </View>
            <View style={styles.card}>
                <Ionicons name="trophy-outline" size={20} color={theme.colors.warning} style={styles.icon} />
                <Text style={styles.value}>{level}</Text>
                <Text style={styles.label}>Level</Text>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flexDirection: 'row',
        paddingHorizontal: theme.spacing.l,
        gap: theme.spacing.m,
        marginBottom: theme.spacing.l,
    },
    card: {
        flex: 1,
        backgroundColor: theme.colors.surface,
        borderRadius: theme.borderRadius.m,
        padding: theme.spacing.m,
        alignItems: 'center',
        ...theme.shadows.small,
    },
    icon: {
        marginBottom: 8,
    },
    value: {
        fontSize: theme.typography.sizes.l,
        fontWeight: 'bold',
        color: theme.colors.text.primary,
        marginBottom: 4,
    },
    label: {
        fontSize: 11,
        color: theme.colors.text.secondary,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
});
