import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '../../theme/theme';

interface Props {
    skillName: string;
    score: number;
    onImprovePress: () => void;
}

export default function WeakAreaCard({ skillName, score, onImprovePress }: Props) {
    return (
        <View style={styles.container}>
            <View style={styles.content}>
                <View style={styles.leftContent}>
                    <View style={styles.iconContainer}>
                        <Ionicons name="trending-down" size={24} color="#EF4444" />
                    </View>
                    <View style={styles.textGroup}>
                        <Text style={styles.label}>Focus Area</Text>
                        <Text style={styles.skillTitle} numberOfLines={1}>{skillName}</Text>
                        <Text style={styles.scoreText}>Current Score: {score}/100</Text>
                    </View>
                </View>
                
                <TouchableOpacity onPress={onImprovePress} activeOpacity={0.8}>
                    <LinearGradient
                        colors={theme.colors.gradients.primary}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={styles.button}
                    >
                        <Text style={styles.buttonText}>Improve Now</Text>
                        <Ionicons name="arrow-forward" size={16} color="white" />
                    </LinearGradient>
                </TouchableOpacity>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        backgroundColor: '#FFFFFF',
        borderRadius: 24,
        padding: 16,
        marginBottom: 20,
        borderWidth: 1,
        borderColor: '#E2E8F0',
        shadowColor: '#6366F1',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.08,
        shadowRadius: 20,
        elevation: 5,
    },
    content: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    leftContent: {
        flexDirection: 'row',
        gap: 12,
        alignItems: 'center',
        flex: 1,
    },
    iconContainer: {
        width: 48,
        height: 48,
        borderRadius: 24,
        backgroundColor: 'rgba(239, 68, 68, 0.08)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    textGroup: {
        flex: 1,
    },
    label: {
        color: '#EF4444',
        fontSize: 10,
        fontWeight: '800',
        textTransform: 'uppercase',
        letterSpacing: 1,
    },
    skillTitle: {
        color: '#0F172A',
        fontSize: 20,
        fontWeight: '800',
        marginTop: -2,
    },
    scoreText: {
        color: '#64748B',
        fontSize: 12,
        fontWeight: '500',
    },
    button: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 14,
        paddingVertical: 10,
        borderRadius: 14,
        gap: 6,
        shadowColor: '#6366F1',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
    },
    buttonText: {
        color: 'white',
        fontSize: 14,
        fontWeight: '800',
    },
});
