import React from 'react';
import { StyleSheet, ViewStyle, StyleProp } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { theme } from '../../theme/theme';

interface GradientCardProps {
    children: React.ReactNode;
    style?: StyleProp<ViewStyle>;
    colors?: readonly string[] | string[];
    start?: { x: number; y: number };
    end?: { x: number; y: number };
}

export const GradientCard: React.FC<GradientCardProps> = ({
    children,
    style,
    colors = theme.colors.gradients.surface,
    start = { x: 0, y: 0 },
    end = { x: 0, y: 1 },
}) => {
    return (
        <LinearGradient
            colors={colors as any}
            start={start}
            end={end}
            style={[styles.card, style]}
        >
            {children}
        </LinearGradient>
    );
};

const styles = StyleSheet.create({
    card: {
        borderRadius: theme.borderRadius.l,
        padding: theme.spacing.m,
        ...theme.shadows.medium,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.6)',
    },
});
