import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system';
import { useUser } from '@clerk/clerk-expo';
import { assessmentApi } from '../../api/assessment';
import { theme } from '../../theme/theme';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

export default function AssessmentSpeakingScreen({ navigation, route }: any) {
    const { user } = useUser();
    const [phase, setPhase] = useState('PHASE_1');
    const [recording, setRecording] = useState<Audio.Recording | null>(null);
    const [isRecording, setIsRecording] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [timer, setTimer] = useState(0);
    const [content, setContent] = useState<any>({
        text: "I like to eat breakfast at home.", // Default Phase 1 text
        level: 'A2'
    });
    const [attempt, setAttempt] = useState(1);
    const [assessmentId, setAssessmentId] = useState<string | null>(null);

    // Phase 1 initialization
    useEffect(() => {
        startAssessment();
    }, []);

    useEffect(() => {
        let interval: any;
        if (isRecording) {
            interval = setInterval(() => {
                setTimer(prev => prev + 1);
            }, 1000);
        } else {
            setTimer(0);
        }
        return () => clearInterval(interval);
    }, [isRecording]);

    const startAssessment = async () => {
        try {
            // Ensure audio permissions are requested early
            const perm = await Audio.requestPermissionsAsync();
            if (perm.status !== 'granted') {
                Alert.alert('Permission Required', 'Microphone access is needed for the assessment.');
                return;
            }

            // No userId needed — backend extracts from auth token
            const res = await assessmentApi.startAssessment();
            if (res && res.id) {
                setAssessmentId(res.id);
            }
        } catch (err: any) {
            console.error("Failed to start assessment:", err);
            const errorMsg = err?.response?.data?.message || "Could not start assessment. Please check your connection.";
            Alert.alert("Error", errorMsg);
        }
    };

    const startRecording = async () => {
        try {
            await Audio.setAudioModeAsync({
                allowsRecordingIOS: true,
                playsInSilentModeIOS: true,
            });

            const { recording } = await Audio.Recording.createAsync(
                Audio.RecordingOptionsPresets.HIGH_QUALITY
            );
            setRecording(recording);
            setIsRecording(true);
        } catch (err) {
            Alert.alert('Error', 'Failed to start recording');
        }
    };

    const stopRecording = async () => {
        setRecording(null);
        setIsRecording(false);
        try {
            await recording?.stopAndUnloadAsync();
            const uri = recording?.getURI();
            if (uri) {
                handleSubmit(uri);
            }
        } catch (error) {
            console.error(error);
        }
    };

    const handleSubmit = async (uri: string) => {
        if (!assessmentId) {
            Alert.alert("Error", "Assessment session not initialized. Please try restarting.");
            return;
        }

        setIsSubmitting(true);
        try {
            const base64 = await FileSystem.readAsStringAsync(uri, {
                encoding: 'base64',
            });

            const res = await assessmentApi.submitPhase(assessmentId, phase, base64, attempt);

            if (res.nextPhase) {
                setPhase(res.nextPhase);
                if (res.nextSentence) setContent(res.nextSentence);
                if (res.imageUrl) setContent({ imageUrl: res.imageUrl, level: res.imageLevel });
                if (res.question) setContent({ question: res.question });

                // If retrying phase 2? logic handled by backend returning same phase
                if (res.nextPhase === phase) {
                    setAttempt(prev => prev + 1);
                } else {
                    setAttempt(1);
                }
            } else if (res.status === 'COMPLETED') {
                navigation.replace('AssessmentResult', { result: res });
            }

        } catch (err) {
            console.error(err);
            Alert.alert("Error", "Submission failed. Please try again.");
        } finally {
            setIsSubmitting(false);
        }
    };

    const renderContent = () => {
        switch (phase) {
            case 'PHASE_1':
            case 'PHASE_2':
                return (
                    <View style={styles.phaseContent}>
                        <Text style={styles.instruction}>Read this sentence aloud:</Text>
                        <View style={styles.card}>
                            <Text style={styles.sentenceText}>{content.text}</Text>
                        </View>
                    </View>
                );
            case 'PHASE_3':
                return (
                    <View style={styles.phaseContent}>
                        <Text style={styles.instruction}>Describe this image in detail:</Text>
                        <Image
                            source={{ uri: content.imageUrl }}
                            style={styles.assessmentImage}
                            resizeMode="contain"
                        />
                    </View>
                );
            case 'PHASE_4':
                return (
                    <View style={styles.phaseContent}>
                        <Text style={styles.instruction}>Answer this question:</Text>
                        <View style={styles.card}>
                            <Text style={styles.sentenceText}>{content.question}</Text>
                        </View>
                    </View>
                );
            default:
                return null;
        }
    };

    return (
        <SafeAreaView style={styles.container}>
            <LinearGradient
                colors={theme.colors.gradients.surface}
                style={styles.background}
            />

            <View style={styles.header}>
                <Text style={styles.headerText}>
                    {phase === 'PHASE_1' && "Reading"}
                    {phase === 'PHASE_2' && "Adaptive Speaking"}
                    {phase === 'PHASE_3' && "Image Description"}
                    {phase === 'PHASE_4' && "Open Response"}
                </Text>
            </View>

            <View style={styles.contentContainer}>
                {renderContent()}
            </View>

            <View style={styles.footer}>
                <View style={styles.timerContainer}>
                    <Text style={styles.timerText}>{isRecording ? `00:0${timer}` : "Ready"}</Text>
                </View>

                <TouchableOpacity
                    onPress={isRecording ? stopRecording : startRecording}
                    disabled={isSubmitting}
                    style={[
                        styles.recordButton,
                        isRecording && styles.recordingActive,
                        isSubmitting && styles.buttonDisabled
                    ]}
                >
                    {isSubmitting ? (
                        <ActivityIndicator color="#FFF" />
                    ) : (
                        <Ionicons
                            name={isRecording ? "stop" : "mic"}
                            size={32}
                            color="#FFF"
                        />
                    )}
                </TouchableOpacity>
                <Text style={styles.hintText}>
                    {isRecording ? "Tap to Stop" : "Tap to Record"}
                </Text>
            </View>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: theme.colors.background,
    },
    background: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: 200,
    },
    header: {
        alignItems: 'center',
        paddingVertical: theme.spacing.m,
    },
    headerText: {
        fontSize: theme.typography.sizes.l,
        fontWeight: 'bold',
        color: theme.colors.text.primary,
    },
    contentContainer: {
        flex: 1,
        justifyContent: 'center',
        padding: theme.spacing.l,
    },
    phaseContent: {
        alignItems: 'center',
        gap: theme.spacing.l,
    },
    instruction: {
        fontSize: theme.typography.sizes.m,
        color: theme.colors.text.secondary,
        textAlign: 'center',
    },
    card: {
        backgroundColor: theme.colors.surface,
        padding: theme.spacing.xl,
        borderRadius: theme.borderRadius.l,
        width: '100%',
        alignItems: 'center',
        ...theme.shadows.medium,
    },
    sentenceText: {
        fontSize: theme.typography.sizes.xl,
        fontWeight: '500',
        color: theme.colors.text.primary,
        textAlign: 'center',
        lineHeight: 32,
    },
    assessmentImage: {
        width: '100%',
        height: 300,
        borderRadius: theme.borderRadius.m,
        backgroundColor: theme.colors.surface,
    },
    footer: {
        alignItems: 'center',
        paddingBottom: 40,
        gap: theme.spacing.m,
    },
    timerContainer: {
        marginBottom: theme.spacing.s,
    },
    timerText: {
        fontSize: theme.typography.sizes.xl,
        fontWeight: 'bold',
        color: theme.colors.primary,
    },
    recordButton: {
        width: 80,
        height: 80,
        borderRadius: 40,
        backgroundColor: theme.colors.primary,
        justifyContent: 'center',
        alignItems: 'center',
        ...theme.shadows.primaryGlow,
    },
    recordingActive: {
        backgroundColor: theme.colors.error || '#EF4444',
        transform: [{ scale: 1.1 }],
    },
    buttonDisabled: {
        opacity: 0.7,
    },
    hintText: {
        color: theme.colors.text.secondary,
        fontSize: theme.typography.sizes.s,
    },
});
