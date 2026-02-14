import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { theme } from '../../theme/theme';
import { Ionicons } from '@expo/vector-icons';

interface FeedbackReadyCardProps {
    onPress: () => void;
    timeAgo?: string;
}

export function FeedbackReadyCard({ onPress, timeAgo = '2 min ago' }: FeedbackReadyCardProps) {
    return (
        <View style={styles.card}>
            <View style={styles.header}>
                <View style={styles.titleRow}>
                    <View style={styles.iconBg}>
                        <Ionicons name="stats-chart" size={16} color="white" />
                    </View>
                    <Text style={styles.title}>Feedback Ready</Text>
                </View>
                <Text style={styles.time}>{timeAgo}</Text>
            </View>

            <Text style={styles.description}>
                Your speaking flow has significantly improved!
            </Text>

            <View style={styles.footer}>
                <View style={styles.tags}>
                    <View style={[styles.tag, { backgroundColor: '#D1FAE5' }]}>
                        <Text style={[styles.tagText, { color: '#065F46' }]}>↑ Fluency</Text>
                    </View>
                    <View style={[styles.tag, { backgroundColor: '#FEE2E2' }]}>
                        <Text style={[styles.tagText, { color: '#991B1B' }]}>↓ vocab</Text>
                    </View>
                </View>

                <TouchableOpacity onPress={onPress} style={styles.detailsBtn}>
                    <Text style={styles.detailsText}>View Details</Text>
                    <Ionicons name="chevron-forward" size={16} color="#059669" />
                </TouchableOpacity>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    card: {
        backgroundColor: '#F0FDF4', // Green-50
        borderRadius: 16,
        padding: theme.spacing.m,
        marginHorizontal: theme.spacing.l,
        marginBottom: theme.spacing.l,
        borderWidth: 1,
        borderColor: '#DCFCE7', // Green-100
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 8,
    },
    titleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    iconBg: {
        width: 28,
        height: 28,
        borderRadius: 14,
        backgroundColor: '#10B981', // Green-500
        justifyContent: 'center',
        alignItems: 'center',
    },
    title: {
        fontSize: 16,
        fontWeight: 'bold',
        color: '#064E3B', // Green-900
    },
    time: {
        fontSize: 12,
        color: '#6B7280', // Gray-500
    },
    description: {
        fontSize: 14,
        color: '#374151', // Gray-700
        marginBottom: 12,
        lineHeight: 20,
    },
    footer: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    tags: {
        flexDirection: 'row',
        gap: 8,
    },
    tag: {
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 6,
    },
    tagText: {
        fontSize: 12,
        fontWeight: '600',
    },
    detailsBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
    },
    detailsText: {
        fontSize: 14,
        fontWeight: '600',
        color: '#059669', // Green-600
    },
});
