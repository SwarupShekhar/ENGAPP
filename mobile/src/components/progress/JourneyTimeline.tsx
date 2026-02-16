import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '../../theme/theme';

interface Milestone {
    id: string;
    title: string;
    description: string;
    isCompleted: boolean;
    date?: string;
    icon: keyof typeof Ionicons.glyphMap;
}

interface JourneyTimelineProps {
    currentLevel: string;
    joinedDate: string;
    totalSessions: number;
}

export const JourneyTimeline: React.FC<JourneyTimelineProps> = ({ currentLevel, joinedDate, totalSessions }) => {
    // Generate simple milestones based on props
    const milestones: Milestone[] = [
        {
            id: '1',
            title: 'Journey Started',
            description: `First Login on ${new Date(joinedDate).toLocaleDateString()}`,
            isCompleted: true,
            icon: 'flag'
        },
        {
            id: '2',
            title: 'First Session',
            description: 'Completed first conversation',
            isCompleted: totalSessions > 0,
            icon: 'mic'
        },
        {
            id: '3',
            title: 'Getting Serious',
            description: '5 Sessions Completed',
            isCompleted: totalSessions >= 5,
            icon: 'trending-up'
        },
        {
            id: '4',
            title: 'Consolidated B1',
            description: 'Reach intermediate fluency',
            isCompleted: currentLevel === 'B1' || currentLevel === 'B2' || currentLevel === 'C1',
            icon: 'school'
        },
        {
            id: '5',
            title: 'Mastery',
            description: 'Reach C1 Advanced level',
            isCompleted: currentLevel === 'C1' || currentLevel === 'C2',
            icon: 'trophy'
        }
    ];

    return (
        <View style={styles.container}>
            <Text style={styles.sectionTitle}>Your Path</Text>

            <View style={styles.timelineContainer}>
                {/* Vertical Line */}
                <View style={styles.verticalLine} />

                {milestones.map((item, index) => (
                    <Animated.View
                        key={item.id}
                        entering={FadeInDown.delay(index * 100).springify()}
                        style={styles.milestoneRow}
                    >
                        {/* Dot/Icon */}
                        <View style={[
                            styles.iconContainer,
                            item.isCompleted ? styles.iconCompleted : styles.iconPending
                        ]}>
                            <Ionicons
                                name={item.icon}
                                size={14}
                                color={item.isCompleted ? 'white' : theme.colors.text.secondary}
                            />
                        </View>

                        {/* Card */}
                        <View style={styles.cardWrapper}>
                            <View style={styles.glassContainer}>
                                <BlurView intensity={20} tint="light" style={styles.blur} />
                                <View style={[
                                    styles.cardContent,
                                    !item.isCompleted && { opacity: 0.6 }
                                ]}>
                                    <Text style={styles.cardTitle}>{item.title}</Text>
                                    <Text style={styles.cardDesc}>{item.description}</Text>
                                    {item.isCompleted && (
                                        <Ionicons
                                            name="checkmark-circle"
                                            size={16}
                                            color={theme.colors.success}
                                            style={styles.checkIcon}
                                        />
                                    )}
                                </View>
                            </View>
                        </View>
                    </Animated.View>
                ))}
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        paddingHorizontal: theme.spacing.m,
        marginBottom: theme.spacing.xl,
    },
    sectionTitle: {
        fontSize: theme.typography.sizes.l,
        fontWeight: 'bold',
        color: theme.colors.text.primary,
        marginBottom: theme.spacing.l,
        marginLeft: theme.spacing.s,
    },
    timelineContainer: {
        position: 'relative',
        paddingLeft: 10,
    },
    verticalLine: {
        position: 'absolute',
        left: 24, // Center of icon (14 radius + 10 padding)
        top: 0,
        bottom: 0,
        width: 2,
        backgroundColor: 'rgba(0,0,0,0.1)',
        borderRadius: 1,
    },
    milestoneRow: {
        flexDirection: 'row',
        marginBottom: theme.spacing.m,
        alignItems: 'center',
    },
    iconContainer: {
        width: 30,
        height: 30,
        borderRadius: 15,
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 1,
        marginRight: theme.spacing.m,
    },
    iconCompleted: {
        backgroundColor: theme.colors.primary,
        shadowColor: theme.colors.primary,
        shadowOpacity: 0.3,
        shadowRadius: 5,
        elevation: 4,
    },
    iconPending: {
        backgroundColor: '#E0E0E0',
        borderWidth: 2,
        borderColor: 'white',
    },
    cardWrapper: {
        flex: 1,
        borderRadius: 16,
        overflow: 'hidden',
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.05,
        shadowRadius: 8,
        elevation: 2,
    },
    glassContainer: {
        backgroundColor: 'rgba(255, 255, 255, 0.6)',
        position: 'relative',
    },
    blur: {
        ...StyleSheet.absoluteFillObject,
    },
    cardContent: {
        padding: theme.spacing.m,
        position: 'relative',
    },
    cardTitle: {
        fontSize: theme.typography.sizes.m,
        fontWeight: '600',
        color: theme.colors.text.primary,
        marginBottom: 2,
    },
    cardDesc: {
        fontSize: theme.typography.sizes.s,
        color: theme.colors.text.secondary,
    },
    checkIcon: {
        position: 'absolute',
        top: theme.spacing.m,
        right: theme.spacing.m,
    }
});
