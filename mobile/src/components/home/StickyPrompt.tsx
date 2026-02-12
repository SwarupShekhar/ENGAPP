import React from 'react';
import { StyleSheet, Text, View, TouchableOpacity } from 'react-native';
import { theme } from '../../theme/theme';
import { MaterialIcons } from '@expo/vector-icons';
import Animated, { FadeInDown } from 'react-native-reanimated';

interface StickyPromptProps {
    onPress: () => void;
    mistakeCount: number;
}

export const StickyPrompt: React.FC<StickyPromptProps> = ({ onPress, mistakeCount }) => {
    if (mistakeCount === 0) return null;

    return (
        <Animated.View entering={FadeInDown.delay(300).springify()} style={styles.container}>
            <TouchableOpacity activeOpacity={0.9} onPress={onPress} style={styles.button}>
                <View style={styles.content}>
                    <View style={styles.iconBadge}>
                        <MaterialIcons name="error-outline" size={20} color={theme.colors.surface} />
                    </View>
                    <View style={styles.textContainer}>
                        <Text style={styles.title}>Practice Required</Text>
                        <Text style={styles.subtitle}>You made {mistakeCount} mistakes recently.</Text>
                    </View>
                </View>
                <View style={styles.action}>
                    <Text style={styles.actionText}>Start</Text>
                    <MaterialIcons name="arrow-forward" size={16} color={theme.colors.surface} />
                </View>
            </TouchableOpacity>
        </Animated.View>
    );
};

const styles = StyleSheet.create({
    container: {
        paddingHorizontal: theme.spacing.m,
        marginBottom: theme.spacing.l,
    },
    button: {
        backgroundColor: theme.colors.secondary, // Using secondary (Emerald) for action
        borderRadius: theme.borderRadius.l,
        padding: theme.spacing.m,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        ...theme.shadows.medium,
    },
    content: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.m,
    },
    iconBadge: {
        backgroundColor: 'rgba(255,255,255,0.2)',
        padding: theme.spacing.s,
        borderRadius: theme.borderRadius.circle,
    },
    textContainer: {
        justifyContent: 'center',
    },
    title: {
        fontSize: theme.typography.sizes.m,
        fontWeight: theme.typography.weights.bold as any,
        color: theme.colors.surface,
    },
    subtitle: {
        fontSize: theme.typography.sizes.xs,
        color: theme.colors.surface,
        opacity: 0.9,
    },
    action: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(255,255,255,0.2)',
        paddingVertical: theme.spacing.xs,
        paddingHorizontal: theme.spacing.s,
        borderRadius: theme.borderRadius.m,
        gap: 4,
    },
    actionText: {
        fontSize: theme.typography.sizes.s,
        fontWeight: theme.typography.weights.medium as any,
        color: theme.colors.surface,
    }
});
