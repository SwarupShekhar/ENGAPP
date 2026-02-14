import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '../../theme/theme';

interface CallOptionCardProps {
    title: string;
    subtitle: string;
    type: '1on1' | 'group';
    onPress: () => void;
}

export function CallOptionCard({ title, subtitle, type, onPress }: CallOptionCardProps) {
    const iconName = type === '1on1' ? 'person' : 'people';
    const color = type === '1on1' ? theme.colors.primary : theme.colors.secondary;

    return (
        <TouchableOpacity
            style={styles.card}
            activeOpacity={0.7}
            onPress={onPress}
        >
            <View style={[styles.iconContainer, { backgroundColor: color + '15' }]}>
                <Ionicons name={iconName} size={24} color={color} />
            </View>
            <View style={styles.textContainer}>
                <Text style={styles.title}>{title}</Text>
                <Text style={styles.subtitle}>{subtitle}</Text>
            </View>
            <View style={styles.arrowContainer}>
                <Ionicons name="chevron-forward" size={20} color={theme.colors.text.secondary} />
            </View>
        </TouchableOpacity>
    );
}

const styles = StyleSheet.create({
    card: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: theme.colors.surface,
        borderRadius: theme.borderRadius.l,
        padding: theme.spacing.m,
        marginBottom: theme.spacing.m,
        marginHorizontal: theme.spacing.l,
        ...theme.shadows.small,
    },
    iconContainer: {
        width: 48,
        height: 48,
        borderRadius: 16,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: theme.spacing.m,
    },
    textContainer: {
        flex: 1,
    },
    title: {
        fontSize: theme.typography.sizes.m,
        fontWeight: 'bold',
        color: theme.colors.text.primary,
        marginBottom: 2,
    },
    subtitle: {
        fontSize: theme.typography.sizes.s,
        color: theme.colors.text.secondary,
    },
    arrowContainer: {
        paddingLeft: theme.spacing.s,
    }
});
