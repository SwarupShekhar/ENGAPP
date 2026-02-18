import React, { useState } from 'react';
import {
    View, Text, StyleSheet, ScrollView, TouchableOpacity,
    Alert, ActivityIndicator, Switch, Linking
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { theme } from '../theme/theme';
import { useUser, useAuth } from '@clerk/clerk-expo';
import { useFocusEffect } from '@react-navigation/native';
import { reliabilityApi, UserReliability } from '../api/reliability';

// ─── Setting Row ───────────────────────────────────────────
function SettingRow({ icon, label, subtitle, onPress, rightElement, danger }: {
    icon: string; label: string; subtitle?: string;
    onPress?: () => void; rightElement?: React.ReactNode; danger?: boolean;
}) {
    return (
        <TouchableOpacity
            style={styles.settingRow}
            onPress={onPress}
            activeOpacity={onPress ? 0.7 : 1}
            disabled={!onPress}
        >
            <View style={[styles.settingIcon, danger && styles.settingIconDanger]}>
                <Ionicons
                    name={icon as any}
                    size={20}
                    color={danger ? theme.colors.error : theme.colors.primary}
                />
            </View>
            <View style={styles.settingTextContainer}>
                <Text style={[styles.settingLabel, danger && styles.settingLabelDanger]}>
                    {label}
                </Text>
                {subtitle && <Text style={styles.settingSubtitle}>{subtitle}</Text>}
            </View>
            {rightElement || (
                onPress && <Ionicons name="chevron-forward" size={18} color={theme.colors.text.secondary} />
            )}
        </TouchableOpacity>
    );
}

// ─── Section Divider ───────────────────────────────────────
function SectionHeader({ title }: { title: string }) {
    return <Text style={styles.sectionTitle}>{title}</Text>;
}

// ─── Reliability Badge ─────────────────────────────────────
function ReliabilityBadge({ score }: { score: number }) {
    let color = theme.colors.primary;
    let label = 'Reliable';
    let icon = 'shield-checkmark';

    if (score >= 90) {
        color = '#10b981'; // Green
        label = 'Excellent';
        icon = 'star';
    } else if (score >= 75) {
        color = '#3b82f6'; // Blue
        label = 'Good';
        icon = 'shield-checkmark';
    } else if (score >= 60) {
        color = '#f59e0b'; // Amber
        label = 'Fair';
        icon = 'alert-circle';
    } else {
        color = '#ef4444'; // Red
        label = 'Low';
        icon = 'warning';
    }

    return (
        <View style={[styles.reliabilityBadge, { backgroundColor: color + '15', borderColor: color + '30' }]}>
            <Ionicons name={icon as any} size={14} color={color} />
            <Text style={[styles.reliabilityText, { color }]}>{score}% {label}</Text>
        </View>
    );
}

// ─── Main Component ────────────────────────────────────────
export default function ProfileScreen() {
    const { user } = useUser();
    const { signOut } = useAuth();
    const [signingOut, setSigningOut] = useState(false);
    const [notificationsEnabled, setNotificationsEnabled] = useState(true);
    const [practiceReminders, setPracticeReminders] = useState(true);
    const [reliability, setReliability] = useState<UserReliability | null>(null);

    const meta = (user?.unsafeMetadata || {}) as any;
    const name = user?.firstName || 'User';
    const email = user?.primaryEmailAddress?.emailAddress || '';
    const initials = name.substring(0, 2).toUpperCase();

    useFocusEffect(
        React.useCallback(() => {
            if (user?.id) {
                reliabilityApi.getUserReliability(user.id)
                    .then(setReliability)
                    .catch(err => console.error('Failed to fetch reliability', err));
            }
        }, [user?.id])
    );

    const handleSignOut = () => {
        Alert.alert(
            "Sign Out",
            "Are you sure you want to sign out?",
            [
                { text: "Cancel", style: "cancel" },
                {
                    text: "Sign Out",
                    style: "destructive",
                    onPress: async () => {
                        setSigningOut(true);
                        try {
                            await signOut();
                        } catch (err) {
                            console.error(err);
                        } finally {
                            setSigningOut(false);
                        }
                    },
                },
            ]
        );
    };

    const handleDeleteAccount = () => {
        Alert.alert(
            "Delete Account",
            "This action is permanent and cannot be undone. All your data will be lost.",
            [
                { text: "Cancel", style: "cancel" },
                {
                    text: "Delete",
                    style: "destructive",
                    onPress: () => {
                        Alert.alert("Contact Support", "Please email support@engr.app to delete your account.");
                    },
                },
            ]
        );
    };

    return (
        <SafeAreaView style={styles.container}>
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>

                {/* Header */}
                <Text style={styles.screenTitle}>Profile</Text>

                {/* User Card */}
                <View style={styles.userCard}>
                    <LinearGradient
                        colors={theme.colors.gradients.primary}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={styles.avatarCircle}
                    >
                        <Text style={styles.avatarText}>{initials}</Text>
                    </LinearGradient>
                    <View style={styles.userInfo}>
                        <Text style={styles.nameText}>{name}</Text>
                        {email ? <Text style={styles.emailText}>{email}</Text> : null}
                        
                        <View style={styles.badgesRow}>
                            <View style={styles.levelPill}>
                                <Ionicons name="trophy-outline" size={12} color={theme.colors.primary} />
                                <Text style={styles.levelPillText}>
                                    {meta.assessmentCompleted ? (meta.assessmentLevel || 'Assessed') : 'Not Assessed'}
                                </Text>
                            </View>
                            {reliability && (
                                <ReliabilityBadge score={reliability.reliabilityScore} />
                            )}
                        </View>
                    </View>
                </View>

                {/* Account Section */}
                <SectionHeader title="Account" />
                <View style={styles.settingCard}>
                    <SettingRow
                        icon="person-outline"
                        label="Edit Profile"
                        subtitle={`${meta.goal || 'No goal set'}`}
                        onPress={() => Alert.alert('Coming Soon', 'Edit profile will be available in the next update.')}
                    />
                    <View style={styles.separator} />
                    <SettingRow
                        icon="language-outline"
                        label="Language"
                        subtitle={meta.nativeLanguage || 'Not set'}
                        onPress={() => Alert.alert('Coming Soon', 'Language settings coming soon.')}
                    />
                </View>

                {/* Notifications Section */}
                <SectionHeader title="Notifications" />
                <View style={styles.settingCard}>
                    <SettingRow
                        icon="notifications-outline"
                        label="Push Notifications"
                        subtitle="Get notified about calls and matches"
                        rightElement={
                            <Switch
                                value={notificationsEnabled}
                                onValueChange={setNotificationsEnabled}
                                trackColor={{ true: theme.colors.primary, false: theme.colors.border }}
                                thumbColor={theme.colors.surface}
                            />
                        }
                    />
                    <View style={styles.separator} />
                    <SettingRow
                        icon="alarm-outline"
                        label="Practice Reminders"
                        subtitle="Daily reminders to practice"
                        rightElement={
                            <Switch
                                value={practiceReminders}
                                onValueChange={setPracticeReminders}
                                trackColor={{ true: theme.colors.primary, false: theme.colors.border }}
                                thumbColor={theme.colors.surface}
                            />
                        }
                    />
                </View>

                {/* Preferences Section */}
                <SectionHeader title="App" />
                <View style={styles.settingCard}>
                    <SettingRow
                        icon="shield-checkmark-outline"
                        label="Privacy Policy"
                        onPress={() => Linking.openURL('https://engr.app/privacy')}
                    />
                    <View style={styles.separator} />
                    <SettingRow
                        icon="document-text-outline"
                        label="Terms of Service"
                        onPress={() => Linking.openURL('https://engr.app/terms')}
                    />
                    <View style={styles.separator} />
                    <SettingRow
                        icon="help-circle-outline"
                        label="Help & Support"
                        onPress={() => Linking.openURL('mailto:support@engr.app')}
                    />
                    <View style={styles.separator} />
                    <SettingRow
                        icon="construct-outline"
                        label="Debug Socket"
                        onPress={() => (navigation as any).navigate('SocketDebug')}
                    />
                    <View style={styles.separator} />
                    <SettingRow
                        icon="star-outline"
                        label="Rate the App"
                        onPress={() => Alert.alert('Thank you!', 'We appreciate your support.')}
                    />
                </View>

                {/* Danger Zone */}
                <SectionHeader title="Danger Zone" />
                <View style={styles.settingCard}>
                    <SettingRow
                        icon="log-out-outline"
                        label="Sign Out"
                        danger
                        onPress={handleSignOut}
                        rightElement={
                            signingOut ? <ActivityIndicator color={theme.colors.error} size="small" /> : undefined
                        }
                    />
                    <View style={styles.separator} />
                    <SettingRow
                        icon="trash-outline"
                        label="Delete Account"
                        subtitle="Permanently delete your data"
                        danger
                        onPress={handleDeleteAccount}
                    />
                </View>

                {/* App Version */}
                <Text style={styles.versionText}>EngR v1.0.0</Text>

            </ScrollView>
        </SafeAreaView>
    );
}

// ─── Styles ────────────────────────────────────────────────
const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#F0F2F8',
    },
    scrollContent: {
        padding: theme.spacing.l,
        paddingBottom: 120,
    },
    screenTitle: {
        fontSize: theme.typography.sizes.xxl,
        fontWeight: 'bold',
        color: theme.colors.text.primary,
        marginBottom: theme.spacing.l,
    },

    // User Card
    userCard: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(255, 255, 255, 0.85)',
        borderRadius: theme.borderRadius.xl,
        padding: theme.spacing.l,
        marginBottom: theme.spacing.l,
        gap: theme.spacing.m,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.6)',
        ...theme.shadows.medium,
    },
    avatarCircle: {
        width: 64,
        height: 64,
        borderRadius: 32,
        justifyContent: 'center',
        alignItems: 'center',
    },
    avatarText: {
        fontSize: theme.typography.sizes.xl,
        fontWeight: 'bold',
        color: theme.colors.surface,
    },
    userInfo: {
        flex: 1,
    },
    nameText: {
        fontSize: theme.typography.sizes.l,
        fontWeight: 'bold',
        color: theme.colors.text.primary,
    },
    emailText: {
        fontSize: theme.typography.sizes.xs,
        color: theme.colors.text.secondary,
        marginTop: 2,
    },
    levelPill: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: theme.spacing.s,
        paddingVertical: 3,
        borderRadius: theme.borderRadius.circle,
        backgroundColor: theme.colors.primary + '12',
    },
    badgesRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: theme.spacing.s,
        gap: 8,
        flexWrap: 'wrap',
    },
    reliabilityBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: theme.spacing.s,
        paddingVertical: 3,
        borderRadius: theme.borderRadius.circle,
        borderWidth: 1,
        gap: 4,
    },
    reliabilityText: {
        fontSize: theme.typography.sizes.xs,
        fontWeight: '600',
    },
    levelPillText: {
        fontSize: theme.typography.sizes.xs,
        fontWeight: '600',
        color: theme.colors.primary,
    },

    // Section
    sectionTitle: {
        fontSize: theme.typography.sizes.s,
        fontWeight: '700',
        color: theme.colors.text.secondary,
        textTransform: 'uppercase',
        letterSpacing: 0.8,
        marginBottom: theme.spacing.s,
        marginTop: theme.spacing.m,
        marginLeft: theme.spacing.xs,
    },

    // Setting Card
    settingCard: {
        backgroundColor: 'rgba(255, 255, 255, 0.85)',
        borderRadius: theme.borderRadius.l,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.6)',
        ...theme.shadows.medium,
    },
    separator: {
        height: 1,
        backgroundColor: theme.colors.border,
        marginLeft: 60,
    },

    // Setting Row
    settingRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 14,
        paddingHorizontal: theme.spacing.m,
        gap: theme.spacing.m,
    },
    settingIcon: {
        width: 36,
        height: 36,
        borderRadius: 10,
        backgroundColor: theme.colors.primary + '12',
        justifyContent: 'center',
        alignItems: 'center',
    },
    settingIconDanger: {
        backgroundColor: theme.colors.error + '12',
    },
    settingTextContainer: {
        flex: 1,
    },
    settingLabel: {
        fontSize: theme.typography.sizes.m,
        fontWeight: '500',
        color: theme.colors.text.primary,
    },
    settingLabelDanger: {
        color: theme.colors.error,
    },
    settingSubtitle: {
        fontSize: theme.typography.sizes.xs,
        color: theme.colors.text.secondary,
        marginTop: 2,
    },

    // Version
    versionText: {
        textAlign: 'center',
        color: theme.colors.text.secondary,
        fontSize: theme.typography.sizes.xs,
        marginTop: theme.spacing.xl,
        opacity: 0.6,
    },
});
