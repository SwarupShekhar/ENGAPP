import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image } from 'react-native';
import { theme } from '../../theme/theme';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

interface ConnectPracticeCardProps {
    onPress: () => void;
}

export function ConnectPracticeCard({ onPress }: ConnectPracticeCardProps) {
    return (
        <View style={styles.card}>
            <View style={styles.iconContainer}>
                <LinearGradient
                    colors={['#3B82F6', '#2563EB']}
                    style={styles.iconBackground}
                >
                    <Ionicons name="people" size={32} color="white" />
                </LinearGradient>
            </View>

            <Text style={styles.title}>Connect & Practice</Text>
            <Text style={styles.subtitle}>Start a live practice session and get feedback</Text>

            <TouchableOpacity
                style={styles.button}
                onPress={onPress}
                activeOpacity={0.8}
            >
                <Text style={styles.buttonText}>Start a Call</Text>
            </TouchableOpacity>
        </View>
    );
}

const styles = StyleSheet.create({
    card: {
        backgroundColor: 'white',
        borderRadius: 24,
        padding: theme.spacing.l,
        alignItems: 'center',
        marginHorizontal: theme.spacing.l,
        marginBottom: theme.spacing.l,
        ...theme.shadows.medium,
        borderWidth: 1,
        borderColor: '#F1F5F9', // Slate-100
    },
    iconContainer: {
        marginBottom: theme.spacing.m,
        ...theme.shadows.primaryGlow,
    },
    iconBackground: {
        width: 64,
        height: 64,
        borderRadius: 32,
        justifyContent: 'center',
        alignItems: 'center',
    },
    title: {
        fontSize: 18,
        fontWeight: 'bold',
        color: theme.colors.text.primary,
        marginBottom: 8,
    },
    subtitle: {
        fontSize: 14,
        color: theme.colors.text.secondary,
        textAlign: 'center',
        marginBottom: theme.spacing.l,
        lineHeight: 20,
    },
    button: {
        backgroundColor: '#1E40AF', // Blue-800 matches mock
        width: '100%',
        paddingVertical: 16,
        borderRadius: 30, // Pill shape
        alignItems: 'center',
        shadowColor: '#1E40AF',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 6,
    },
    buttonText: {
        color: 'white',
        fontSize: 16,
        fontWeight: 'bold',
    },
});
