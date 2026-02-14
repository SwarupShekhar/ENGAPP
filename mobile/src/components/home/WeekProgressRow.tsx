import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { theme } from '../../theme/theme';
import { Ionicons } from '@expo/vector-icons';

interface WeekProgressRowProps {
    mistakes: number;
    words: number;
    level: string;
}

export function WeekProgressRow({ mistakes, words, level }: WeekProgressRowProps) {
    return (
        <View style={styles.container}>
            <View style={styles.card}>
                <View style={[styles.iconContainer, { backgroundColor: '#FEE2E2' }]}>
                    <Ionicons name="close" size={20} color="#EF4444" />
                </View>
                <Text style={styles.value}>{mistakes}</Text>
                <Text style={styles.label}>Mistakes</Text>
                <Text style={styles.label}>Fixed</Text>
            </View>

            <View style={styles.card}>
                <View style={[styles.iconContainer, { backgroundColor: '#DBEAFE' }]}>
                    <Ionicons name="book" size={20} color="#3B82F6" />
                </View>
                <Text style={styles.value}>{words}</Text>
                <Text style={styles.label}>New Words</Text>
            </View>

            <View style={styles.card}>
                <View style={[styles.iconContainer, { backgroundColor: '#FEF3C7' }]}>
                    <Ionicons name="trophy" size={20} color="#F59E0B" />
                </View>
                <Text style={styles.value}>{level}</Text>
                <Text style={styles.label}>Current Level</Text>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flexDirection: 'row',
        paddingHorizontal: theme.spacing.l,
        gap: theme.spacing.m,
        marginBottom: theme.spacing.xl,
    },
    card: {
        flex: 1,
        backgroundColor: 'white',
        borderRadius: 16,
        padding: theme.spacing.m,
        alignItems: 'center',
        ...theme.shadows.small,
        borderWidth: 1,
        borderColor: '#F1F5F9',
        height: 140, // Fixed height for uniformity
        justifyContent: 'center',
    },
    iconContainer: {
        width: 40,
        height: 40,
        borderRadius: 20,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 12,
    },
    value: {
        fontSize: 20,
        fontWeight: 'bold',
        color: theme.colors.text.primary,
        marginBottom: 4,
    },
    label: {
        fontSize: 12,
        color: theme.colors.text.secondary,
        textAlign: 'center',
        lineHeight: 16,
    },
});
