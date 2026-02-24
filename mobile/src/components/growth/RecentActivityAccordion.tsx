import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, LayoutAnimation, Platform, UIManager } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { theme } from '../../theme/theme';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
    UIManager.setLayoutAnimationEnabledExperimental(true);
}

interface Props {
    sessions: any[];
}

export default function RecentActivityAccordion({ sessions }: Props) {
    const [isExpanded, setIsExpanded] = useState(false);

    const toggleExpand = () => {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        setIsExpanded(!isExpanded);
    };

    const displaySessions = isExpanded ? sessions : sessions.slice(0, 3);
    const hasMore = sessions.length > 3;

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <Text style={styles.title}>Recent Activity</Text>
                {hasMore && (
                    <TouchableOpacity onPress={toggleExpand}>
                        <Text style={styles.viewAll}>
                            {isExpanded ? 'Show Less' : 'View All'}
                        </Text>
                    </TouchableOpacity>
                )}
            </View>

            <View style={styles.list}>
                {displaySessions.map((session, index) => {
                    const date = new Date(session.startedAt).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                    });
                    const score = session.analyses?.[0]?.scores?.overall || 0;

                    return (
                        <View key={session.id || index} style={styles.sessionItem}>
                            <View style={styles.sessionLeft}>
                                    <LinearGradient
                                        colors={['#E0E7FF', '#EEF2FF']}
                                        style={styles.iconBox}
                                    >
                                        <Ionicons name="mic-outline" size={20} color="#6366F1" />
                                    </LinearGradient>
                                    <View>
                                        <Text style={styles.sessionName}>
                                            {session.partnerName || 'AI Tutor Session'}
                                        </Text>
                                        <Text style={styles.sessionDate}>{date}</Text>
                                </View>
                            </View>
                            <View style={styles.scoreBadge}>
                                <Text style={styles.scoreText}>{score}</Text>
                            </View>
                        </View>
                    );
                })}

                {sessions.length === 0 && (
                    <Text style={styles.emptyText}>No recent activity yet</Text>
                )}
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        marginBottom: 32,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 4,
        marginBottom: 16,
    },
    title: {
        color: '#0F172A',
        fontSize: 18,
        fontWeight: 'bold',
    },
    viewAll: {
        color: '#6366f1',
        fontSize: 14,
        fontWeight: '600',
    },
    list: {
        gap: 12,
    },
    sessionItem: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        backgroundColor: '#FFFFFF',
        padding: 16,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: '#E2E8F0',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 3,
        elevation: 1,
    },
    sessionLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    iconBox: {
        width: 40,
        height: 40,
        borderRadius: 12,
        justifyContent: 'center',
        alignItems: 'center',
    },
    sessionName: {
        color: '#0F172A',
        fontSize: 15,
        fontWeight: '600',
    },
    sessionDate: {
        color: '#64748B',
        fontSize: 12,
        marginTop: 2,
    },
    scoreBadge: {
        backgroundColor: 'rgba(16,185,129,0.1)',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 10,
    },
    scoreText: {
        color: '#10b981',
        fontSize: 14,
        fontWeight: 'bold',
    },
    emptyText: {
        color: '#94A3B8',
        textAlign: 'center',
        marginTop: 20,
        fontSize: 14,
    },
});
