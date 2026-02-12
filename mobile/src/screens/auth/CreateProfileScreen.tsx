import React, { useState, useRef } from 'react';
import {
    View, Text, TextInput, TouchableOpacity, StyleSheet,
    ScrollView, KeyboardAvoidingView, Platform, Alert,
    Animated, Dimensions, ActivityIndicator
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '../../theme/theme';
import { useUser } from '@clerk/clerk-expo';
import { client } from '../../api/client';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const TOTAL_STEPS = 4;

// ─── Data Options ──────────────────────────────────────────
const AGE_RANGES = ['13–17', '18–24', '25–34', '35–44', '45+'];
const NATIVE_LANGUAGES = ['Hindi', 'Tamil', 'Telugu', 'Bengali', 'Marathi', 'Kannada', 'Other'];
const GOALS = [
    { label: 'Job Interviews', icon: 'briefcase-outline' },
    { label: 'IELTS / TOEFL', icon: 'school-outline' },
    { label: 'Workplace', icon: 'business-outline' },
    { label: 'Casual Conversations', icon: 'chatbubbles-outline' },
    { label: 'Academic', icon: 'book-outline' },
    { label: 'Travel', icon: 'airplane-outline' },
];
const INTERESTS = [
    { label: 'Movies & TV', icon: '🎬' },
    { label: 'Music', icon: '🎵' },
    { label: 'Sports', icon: '⚽' },
    { label: 'Technology', icon: '💻' },
    { label: 'Travel', icon: '✈️' },
    { label: 'Cooking', icon: '🍳' },
    { label: 'Reading', icon: '📚' },
    { label: 'Gaming', icon: '🎮' },
    { label: 'Fitness', icon: '💪' },
    { label: 'Art & Design', icon: '🎨' },
    { label: 'Business', icon: '📈' },
    { label: 'Science', icon: '🔬' },
];

// ─── Chip Component ────────────────────────────────────────
function Chip({ label, selected, onPress, icon }: {
    label: string; selected: boolean; onPress: () => void; icon?: string;
}) {
    return (
        <TouchableOpacity
            activeOpacity={0.7}
            onPress={onPress}
            style={[styles.chip, selected && styles.chipSelected]}
        >
            {icon && <Text style={styles.chipIcon}>{icon}</Text>}
            <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{label}</Text>
            {selected && <Ionicons name="checkmark-circle" size={16} color={theme.colors.primary} style={{ marginLeft: 4 }} />}
        </TouchableOpacity>
    );
}

// ─── Icon Chip for Goals ───────────────────────────────────
function GoalChip({ label, icon, selected, onPress }: {
    label: string; icon: string; selected: boolean; onPress: () => void;
}) {
    return (
        <TouchableOpacity
            activeOpacity={0.7}
            onPress={onPress}
            style={[styles.goalChip, selected && styles.goalChipSelected]}
        >
            <Ionicons
                name={icon as any}
                size={24}
                color={selected ? theme.colors.primary : theme.colors.text.secondary}
            />
            <Text style={[styles.goalChipText, selected && styles.goalChipTextSelected]}>{label}</Text>
            {selected && (
                <View style={styles.goalCheck}>
                    <Ionicons name="checkmark-circle" size={18} color={theme.colors.primary} />
                </View>
            )}
        </TouchableOpacity>
    );
}

// ─── Progress Dots ─────────────────────────────────────────
function ProgressDots({ current, total }: { current: number; total: number }) {
    return (
        <View style={styles.dotsContainer}>
            {Array.from({ length: total }).map((_, i) => (
                <View
                    key={i}
                    style={[
                        styles.dot,
                        i === current && styles.dotActive,
                        i < current && styles.dotCompleted,
                    ]}
                />
            ))}
        </View>
    );
}

// ─── Main Component ────────────────────────────────────────
export default function CreateProfileScreen({ navigation, onFinish }: any) {
    const [step, setStep] = useState(0);
    const [name, setName] = useState('');
    const [ageRange, setAgeRange] = useState<string | null>(null);
    const [nativeLanguage, setNativeLanguage] = useState<string | null>(null);
    const [goal, setGoal] = useState<string | null>(null);
    const [gender, setGender] = useState<string | null>(null);
    const [interests, setInterests] = useState<string[]>([]);
    const [saving, setSaving] = useState(false);
    const { user } = useUser();

    const slideAnim = useRef(new Animated.Value(0)).current;

    const animateToStep = (nextStep: number) => {
        const direction = nextStep > step ? 1 : -1;
        Animated.sequence([
            Animated.timing(slideAnim, {
                toValue: -direction * SCREEN_WIDTH,
                duration: 150,
                useNativeDriver: true,
            }),
            Animated.timing(slideAnim, {
                toValue: direction * SCREEN_WIDTH,
                duration: 0,
                useNativeDriver: true,
            }),
            Animated.timing(slideAnim, {
                toValue: 0,
                duration: 200,
                useNativeDriver: true,
            }),
        ]).start();
        setStep(nextStep);
    };

    const canProceed = () => {
        switch (step) {
            case 0: return name.trim().length > 0 && ageRange && nativeLanguage;
            case 1: return !!goal;
            case 2: return true; // Gender is optional
            case 3: return interests.length >= 3;
            default: return false;
        }
    };

    const toggleInterest = (interest: string) => {
        setInterests(prev =>
            prev.includes(interest)
                ? prev.filter(i => i !== interest)
                : [...prev, interest]
        );
    };

    const handleFinish = async () => {
        if (!user) return;
        setSaving(true);
        console.log('--- Profile Save Started ---');
        try {
            // 1. Update Clerk profile metadata
            console.log('1. Updating Clerk profile...');
            await user.update({
                firstName: name.trim(),
                unsafeMetadata: {
                    ...(user.unsafeMetadata || {}),
                    ageRange,
                    nativeLanguage,
                    goal,
                    gender: gender || 'prefer_not_to_say',
                    interests,
                    profileCompleted: true,
                },
            });
            console.log('Clerk metadata updated.');

            // 2. Register user in backend DB (non-blocking)
            console.log('2. Syncing with backend...');
            try {
                await client.post('/auth/register', {
                    clerkId: user.id,
                    firstName: name.trim(),
                    lastName: '',
                    gender: gender || 'prefer_not_to_say',
                    hobbies: interests,
                    nativeLang: nativeLanguage || 'english',
                    level: 'beginner',
                }, { timeout: 10000 });
                console.log('Backend sync successful.');
            } catch (regErr: any) {
                console.warn('Backend sync failed/timed out:', regErr.message);
                // Proceed anyway, backend can handle lazy registration
            }

            console.log('3. Navigating to AssessmentIntro...');
            navigation.replace('AssessmentIntro');
        } catch (err: any) {
            console.error('Finalize Profile Error:', err);
            Alert.alert("Error", "Failed to save profile: " + (err.message || "Please check your network."));
        } finally {
            setSaving(false);
            console.log('--- Profile Save Finished ---');
        }
    };

    const handleNext = () => {
        if (step < TOTAL_STEPS - 1) {
            animateToStep(step + 1);
        } else {
            handleFinish();
        }
    };

    const handleBack = () => {
        if (step > 0) animateToStep(step - 1);
    };

    // ─── Step Content Renderers ────────────────────────────
    const renderStep0 = () => (
        <View style={styles.stepContent}>
            <Text style={styles.stepTitle}>Let's get to know you</Text>
            <Text style={styles.stepSubtitle}>Tell us a bit about yourself</Text>

            <View style={styles.inputGroup}>
                <Text style={styles.label}>What's your name?</Text>
                <TextInput
                    style={styles.input}
                    placeholder="Enter your name"
                    placeholderTextColor={theme.colors.text.secondary}
                    value={name}
                    onChangeText={setName}
                    autoFocus
                />
            </View>

            <View style={styles.inputGroup}>
                <Text style={styles.label}>Age Range</Text>
                <View style={styles.chipRow}>
                    {AGE_RANGES.map(range => (
                        <Chip
                            key={range}
                            label={range}
                            selected={ageRange === range}
                            onPress={() => setAgeRange(range)}
                        />
                    ))}
                </View>
            </View>

            <View style={styles.inputGroup}>
                <Text style={styles.label}>Native Language</Text>
                <View style={styles.chipRow}>
                    {NATIVE_LANGUAGES.map(lang => (
                        <Chip
                            key={lang}
                            label={lang}
                            selected={nativeLanguage === lang}
                            onPress={() => setNativeLanguage(lang)}
                        />
                    ))}
                </View>
            </View>
        </View>
    );

    const renderStep1 = () => (
        <View style={styles.stepContent}>
            <Text style={styles.stepTitle}>What's your goal?</Text>
            <Text style={styles.stepSubtitle}>This helps us personalize your experience</Text>

            <View style={styles.goalGrid}>
                {GOALS.map(g => (
                    <GoalChip
                        key={g.label}
                        label={g.label}
                        icon={g.icon}
                        selected={goal === g.label}
                        onPress={() => setGoal(g.label)}
                    />
                ))}
            </View>
        </View>
    );

    const renderStep2 = () => (
        <View style={styles.stepContent}>
            <Text style={styles.stepTitle}>What do you identify as?</Text>
            <Text style={styles.stepSubtitle}>Optional — helps us match you better</Text>

            <View style={styles.genderGrid}>
                {[
                    { key: 'male', label: 'Male', icon: 'male-outline' },
                    { key: 'female', label: 'Female', icon: 'female-outline' },
                    { key: 'non_binary', label: 'Non-binary', icon: 'person-outline' },
                    { key: 'prefer_not_to_say', label: 'Prefer not to say', icon: 'remove-circle-outline' },
                ].map(g => (
                    <TouchableOpacity
                        key={g.key}
                        activeOpacity={0.7}
                        onPress={() => setGender(g.key)}
                        style={[styles.genderCard, gender === g.key && styles.genderCardSelected]}
                    >
                        <Ionicons
                            name={g.icon as any}
                            size={32}
                            color={gender === g.key ? theme.colors.primary : theme.colors.text.secondary}
                        />
                        <Text style={[styles.genderText, gender === g.key && styles.genderTextSelected]}>
                            {g.label}
                        </Text>
                        {gender === g.key && (
                            <View style={styles.genderCheck}>
                                <Ionicons name="checkmark-circle" size={20} color={theme.colors.primary} />
                            </View>
                        )}
                    </TouchableOpacity>
                ))}
            </View>
        </View>
    );

    const renderStep3 = () => (
        <View style={styles.stepContent}>
            <Text style={styles.stepTitle}>Your Interests</Text>
            <Text style={styles.stepSubtitle}>
                Select at least 3 — we'll use these for matchmaking
            </Text>

            <View style={styles.interestGrid}>
                {INTERESTS.map(item => (
                    <Chip
                        key={item.label}
                        label={item.label}
                        icon={item.icon}
                        selected={interests.includes(item.label)}
                        onPress={() => toggleInterest(item.label)}
                    />
                ))}
            </View>

            {interests.length > 0 && interests.length < 3 && (
                <Text style={styles.hintText}>
                    Select {3 - interests.length} more
                </Text>
            )}
        </View>
    );

    const renderCurrentStep = () => {
        switch (step) {
            case 0: return renderStep0();
            case 1: return renderStep1();
            case 2: return renderStep2();
            case 3: return renderStep3();
            default: return null;
        }
    };

    const getButtonLabel = () => {
        if (step === TOTAL_STEPS - 1) return saving ? '' : 'Get Started';
        if (step === 2 && !gender) return 'Skip';
        return 'Next';
    };

    return (
        <SafeAreaView style={styles.container}>
            {/* Header with back + progress */}
            <View style={styles.header}>
                {step > 0 ? (
                    <TouchableOpacity onPress={handleBack} style={styles.backButton}>
                        <Ionicons name="arrow-back" size={24} color={theme.colors.text.primary} />
                    </TouchableOpacity>
                ) : (
                    <View style={styles.backButton} />
                )}
                <ProgressDots current={step} total={TOTAL_STEPS} />
                <View style={styles.backButton} />
            </View>

            {/* Animated Step Content */}
            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                style={{ flex: 1 }}
            >
                <Animated.View style={[styles.animatedContainer, { transform: [{ translateX: slideAnim }] }]}>
                    <ScrollView
                        contentContainerStyle={styles.scrollContent}
                        showsVerticalScrollIndicator={false}
                        keyboardShouldPersistTaps="handled"
                    >
                        {renderCurrentStep()}
                    </ScrollView>
                </Animated.View>
            </KeyboardAvoidingView>

            {/* Footer Button */}
            <View style={styles.footer}>
                <TouchableOpacity
                    disabled={!canProceed() || saving}
                    style={[styles.buttonContainer, (!canProceed() && step !== 2) && styles.buttonDisabled]}
                    onPress={handleNext}
                    activeOpacity={0.8}
                >
                    <LinearGradient
                        colors={
                            (!canProceed() && step !== 2)
                                ? [theme.colors.text.light, theme.colors.text.light]
                                : theme.colors.gradients.primary
                        }
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 0 }}
                        style={styles.gradientButton}
                    >
                        {saving ? (
                            <ActivityIndicator color={theme.colors.surface} />
                        ) : (
                            <>
                                <Text style={styles.buttonText}>{getButtonLabel()}</Text>
                                <Ionicons name="arrow-forward" size={20} color={theme.colors.surface} />
                            </>
                        )}
                    </LinearGradient>
                </TouchableOpacity>
            </View>
        </SafeAreaView>
    );
}

// ─── Styles ────────────────────────────────────────────────
const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: theme.colors.background,
    },

    // Header
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: theme.spacing.m,
        paddingVertical: theme.spacing.s,
    },
    backButton: {
        width: 40,
        height: 40,
        justifyContent: 'center',
        alignItems: 'center',
    },

    // Progress Dots
    dotsContainer: {
        flexDirection: 'row',
        gap: 8,
    },
    dot: {
        width: 10,
        height: 10,
        borderRadius: 5,
        backgroundColor: theme.colors.border,
    },
    dotActive: {
        width: 28,
        backgroundColor: theme.colors.primary,
    },
    dotCompleted: {
        backgroundColor: theme.colors.primaryLight,
    },

    // Content
    animatedContainer: {
        flex: 1,
    },
    scrollContent: {
        padding: theme.spacing.l,
        paddingBottom: 120,
    },
    stepContent: {
        gap: theme.spacing.xl,
    },
    stepTitle: {
        fontSize: theme.typography.sizes.xxl,
        fontWeight: 'bold',
        color: theme.colors.text.primary,
    },
    stepSubtitle: {
        fontSize: theme.typography.sizes.m,
        color: theme.colors.text.secondary,
        marginTop: -theme.spacing.m,
    },

    // Input
    inputGroup: {
        gap: theme.spacing.s,
    },
    label: {
        fontSize: theme.typography.sizes.m,
        fontWeight: '600',
        color: theme.colors.text.primary,
    },
    input: {
        backgroundColor: theme.colors.surface,
        borderRadius: theme.borderRadius.m,
        padding: theme.spacing.m,
        fontSize: theme.typography.sizes.m,
        color: theme.colors.text.primary,
        borderWidth: 1,
        borderColor: theme.colors.border,
        ...theme.shadows.small,
    },

    // Chips
    chipRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: theme.spacing.s,
    },
    chip: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: theme.spacing.m,
        paddingVertical: 10,
        borderRadius: theme.borderRadius.circle,
        backgroundColor: theme.colors.surface,
        borderWidth: 1.5,
        borderColor: theme.colors.border,
        gap: 4,
    },
    chipSelected: {
        borderColor: theme.colors.primary,
        backgroundColor: theme.colors.primary + '10',
    },
    chipIcon: {
        fontSize: 16,
    },
    chipText: {
        fontSize: theme.typography.sizes.s,
        fontWeight: '500',
        color: theme.colors.text.secondary,
    },
    chipTextSelected: {
        color: theme.colors.primary,
        fontWeight: '600',
    },

    // Goal Chips
    goalGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: theme.spacing.m,
    },
    goalChip: {
        width: (SCREEN_WIDTH - theme.spacing.l * 2 - theme.spacing.m) / 2,
        backgroundColor: theme.colors.surface,
        borderRadius: theme.borderRadius.l,
        padding: theme.spacing.m,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 2,
        borderColor: 'transparent',
        gap: theme.spacing.s,
        minHeight: 100,
        ...theme.shadows.small,
    },
    goalChipSelected: {
        borderColor: theme.colors.primary,
        backgroundColor: theme.colors.primary + '08',
    },
    goalChipText: {
        fontSize: theme.typography.sizes.s,
        fontWeight: '600',
        color: theme.colors.text.secondary,
        textAlign: 'center',
    },
    goalChipTextSelected: {
        color: theme.colors.primary,
    },
    goalCheck: {
        position: 'absolute',
        top: 8,
        right: 8,
    },

    // Gender Cards
    genderGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: theme.spacing.m,
    },
    genderCard: {
        width: (SCREEN_WIDTH - theme.spacing.l * 2 - theme.spacing.m) / 2,
        backgroundColor: theme.colors.surface,
        borderRadius: theme.borderRadius.l,
        padding: theme.spacing.l,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 2,
        borderColor: 'transparent',
        gap: theme.spacing.s,
        ...theme.shadows.small,
    },
    genderCardSelected: {
        borderColor: theme.colors.primary,
        backgroundColor: theme.colors.primary + '08',
    },
    genderText: {
        fontSize: theme.typography.sizes.s,
        fontWeight: '600',
        color: theme.colors.text.secondary,
        textAlign: 'center',
    },
    genderTextSelected: {
        color: theme.colors.primary,
    },
    genderCheck: {
        position: 'absolute',
        top: 8,
        right: 8,
    },

    // Interest Grid
    interestGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: theme.spacing.s,
    },
    hintText: {
        fontSize: theme.typography.sizes.s,
        color: theme.colors.warning,
        fontWeight: '500',
        textAlign: 'center',
    },

    // Footer
    footer: {
        padding: theme.spacing.l,
        paddingBottom: theme.spacing.m,
        backgroundColor: theme.colors.background,
    },
    buttonContainer: {
        borderRadius: theme.borderRadius.l,
        overflow: 'hidden',
        ...theme.shadows.primaryGlow,
    },
    buttonDisabled: {
        shadowOpacity: 0,
        opacity: 0.7,
    },
    gradientButton: {
        paddingVertical: theme.spacing.m,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: theme.spacing.s,
    },
    buttonText: {
        color: theme.colors.surface,
        fontSize: theme.typography.sizes.l,
        fontWeight: 'bold',
    },
});
