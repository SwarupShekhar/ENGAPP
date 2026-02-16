import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { theme } from '../../theme/theme';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

interface ConnectPracticeCardProps {
    onPress: () => void;
}

export function ConnectPracticeCard({ onPress }: ConnectPracticeCardProps) {
    return (
        <View style={styles.cardOuter}>
            <LinearGradient
                colors={['#4F46E5', '#7C3AED']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.card}
            >
                {/* Decorative circles */}
                <View style={styles.decorCircle1} />
                <View style={styles.decorCircle2} />

                <View style={styles.contentRow}>
                    <View style={styles.textColumn}>
                        <Text style={styles.title}>Ready to{'\n'}Practice?</Text>
                        <Text style={styles.subtitle}>
                            Get live feedback on your English
                        </Text>
                    </View>
                    <View style={styles.iconColumn}>
                        <View style={styles.iconCircle}>
                            <Ionicons name="call" size={28} color="#4F46E5" />
                        </View>
                    </View>
                </View>

                <TouchableOpacity
                    style={styles.button}
                    onPress={onPress}
                    activeOpacity={0.85}
                >
                    <Ionicons name="mic" size={18} color="#4F46E5" style={{ marginRight: 8 }} />
                    <Text style={styles.buttonText}>Start a Call</Text>
                </TouchableOpacity>
            </LinearGradient>
        </View>
    );
}

const styles = StyleSheet.create({
    cardOuter: {
        marginHorizontal: theme.spacing.l,
        marginBottom: theme.spacing.l,
        borderRadius: 24,
        // Glow shadow
        shadowColor: '#6366F1',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.35,
        shadowRadius: 16,
        elevation: 10,
    },
    card: {
        borderRadius: 24,
        padding: theme.spacing.l,
        overflow: 'hidden',
        // Glassmorphism inner glow
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.2)',
    },
    decorCircle1: {
        position: 'absolute',
        width: 120,
        height: 120,
        borderRadius: 60,
        backgroundColor: 'rgba(255,255,255,0.08)',
        top: -30,
        right: -20,
    },
    decorCircle2: {
        position: 'absolute',
        width: 80,
        height: 80,
        borderRadius: 40,
        backgroundColor: 'rgba(255,255,255,0.06)',
        bottom: -10,
        left: -10,
    },
    contentRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: theme.spacing.l,
    },
    textColumn: {
        flex: 1,
    },
    title: {
        fontSize: 24,
        fontWeight: '800',
        color: 'white',
        lineHeight: 30,
        marginBottom: 6,
    },
    subtitle: {
        fontSize: 14,
        color: 'rgba(255,255,255,0.75)',
        lineHeight: 20,
    },
    iconColumn: {
        marginLeft: theme.spacing.m,
    },
    iconCircle: {
        width: 56,
        height: 56,
        borderRadius: 28,
        backgroundColor: 'white',
        justifyContent: 'center',
        alignItems: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.15,
        shadowRadius: 8,
        elevation: 4,
    },
    button: {
        backgroundColor: 'rgba(255, 255, 255, 0.95)',
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        paddingVertical: 14,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.8)',
    },
    buttonText: {
        color: '#4F46E5',
        fontSize: 16,
        fontWeight: '700',
    },
});
