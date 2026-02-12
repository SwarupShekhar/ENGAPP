import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, TextInput, Keyboard, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '../../theme/theme';
import { LinearGradient } from 'expo-linear-gradient';
import { useSignIn, useSignUp } from '@clerk/clerk-expo';

export default function OTPScreen({ navigation, route }: any) {
    const [otp, setOtp] = useState(['', '', '', '']);
    const [timer, setTimer] = useState(30);
    const inputRefs = useRef<Array<TextInput | null>>([]);

    // Default to empty strings if params are missing to avoid crash, though they should be there.
    const { phoneNumber, flow } = route.params || {};

    const { signIn, setActive: setSignInActive, isLoaded: isSignInLoaded } = useSignIn();
    const { signUp, setActive: setSignUpActive, isLoaded: isSignUpLoaded } = useSignUp();

    useEffect(() => {
        const interval = setInterval(() => {
            setTimer((prev) => (prev > 0 ? prev - 1 : 0));
        }, 1000);
        return () => clearInterval(interval);
    }, []);

    const handleChange = (text: string, index: number) => {
        const newOtp = [...otp];
        newOtp[index] = text;
        setOtp(newOtp);

        if (text && index < 3) {
            inputRefs.current[index + 1]?.focus();
        }

        // Auto-submit if last digit filled
        if (index === 3 && text) {
            // Optional: handleVerify(); 
        }
    };

    const handleKeyPress = (e: any, index: number) => {
        if (e.nativeEvent.key === 'Backspace' && !otp[index] && index > 0) {
            inputRefs.current[index - 1]?.focus();
        }
    };

    const handleVerify = async () => {
        const code = otp.join('');
        if (code.length !== 4) {
            Alert.alert("Error", "Please enter a valid 4-digit code.");
            return;
        }

        if (!isSignInLoaded || !isSignUpLoaded) return;

        try {
            if (flow === 'signIn') {
                const completeSignIn = await signIn.attemptFirstFactor({
                    strategy: "phone_code",
                    code,
                });

                if (completeSignIn.status === 'complete') {
                    await setSignInActive({ session: completeSignIn.createdSessionId });
                    // Navigation handled by App.tsx switching to RootNavigator
                } else {
                    console.log(JSON.stringify(completeSignIn, null, 2));
                    Alert.alert("Error", "Login incomplete. Check logs.");
                }
            } else {
                const completeSignUp = await signUp.attemptPhoneNumberVerification({
                    code,
                });

                if (completeSignUp.status === 'complete') {
                    await setSignUpActive({ session: completeSignUp.createdSessionId });
                    // User created. Profile creation handled by checking user data in Root.
                } else {
                    Alert.alert("Error", "Signup incomplete.");
                }
            }
        } catch (err: any) {
            Alert.alert("Error", err.errors ? err.errors[0].message : "Verification failed");
        }
    };

    return (
        <SafeAreaView style={styles.container}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
                    <Ionicons name="arrow-back" size={24} color={theme.colors.text.primary} />
                </TouchableOpacity>
            </View>

            <View style={styles.content}>
                <Text style={styles.title}>Verify Phone</Text>
                <Text style={styles.subtitle}>
                    Code sent to <Text style={styles.phoneNumber}>{phoneNumber}</Text>
                </Text>

                <View style={styles.otpContainer}>
                    {otp.map((digit, index) => (
                        <TextInput
                            key={index}
                            ref={(ref) => { inputRefs.current[index] = ref; }}
                            style={[
                                styles.otpInput,
                                digit ? styles.otpInputFilled : null,
                            ]}
                            keyboardType="number-pad"
                            maxLength={1}
                            value={digit}
                            onChangeText={(text) => handleChange(text, index)}
                            onKeyPress={(e) => handleKeyPress(e, index)}
                            autoFocus={index === 0}
                        />
                    ))}
                </View>

                <TouchableOpacity
                    style={styles.verifyButton}
                    onPress={handleVerify}
                    activeOpacity={0.8}
                >
                    <LinearGradient
                        colors={theme.colors.gradients.primary}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 0 }}
                        style={styles.gradientButton}
                    >
                        <Text style={styles.verifyButtonText}>Verify & Continue</Text>
                        <Ionicons name="arrow-forward" size={20} color={theme.colors.surface} />
                    </LinearGradient>
                </TouchableOpacity>

                <View style={styles.resendContainer}>
                    <Text style={styles.resendText}>Didn't receive code? </Text>
                    {timer > 0 ? (
                        <Text style={styles.timerText}>Resend in 00:{timer < 10 ? `0${timer}` : timer}</Text>
                    ) : (
                        <TouchableOpacity onPress={() => setTimer(30)}>
                            <Text style={styles.resendLink}>Resend OTP</Text>
                        </TouchableOpacity>
                    )}
                </View>
            </View>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: theme.colors.background,
    },
    header: {
        paddingHorizontal: theme.spacing.m,
        paddingTop: theme.spacing.s,
    },
    backButton: {
        padding: theme.spacing.xs,
        borderRadius: theme.borderRadius.circle,
        backgroundColor: theme.colors.surface,
        alignSelf: 'flex-start',
        ...theme.shadows.small,
    },
    content: {
        flex: 1,
        paddingHorizontal: theme.spacing.l,
        paddingTop: theme.spacing.xl,
        alignItems: 'center',
    },
    title: {
        fontSize: theme.typography.sizes.xl,
        fontWeight: 'bold',
        color: theme.colors.text.primary,
        marginBottom: theme.spacing.s,
    },
    subtitle: {
        fontSize: theme.typography.sizes.m,
        color: theme.colors.text.secondary,
        textAlign: 'center',
        marginBottom: theme.spacing.xl,
    },
    phoneNumber: {
        color: theme.colors.text.primary,
        fontWeight: '600',
    },
    otpContainer: {
        flexDirection: 'row',
        gap: theme.spacing.m,
        marginBottom: theme.spacing.xl,
    },
    otpInput: {
        width: 60,
        height: 60,
        borderRadius: theme.borderRadius.m,
        borderWidth: 1.5,
        borderColor: theme.colors.border,
        backgroundColor: theme.colors.surface,
        fontSize: theme.typography.sizes.xl,
        fontWeight: 'bold',
        color: theme.colors.text.primary,
        textAlign: 'center',
        ...theme.shadows.small,
    },
    otpInputFilled: {
        borderColor: theme.colors.primary,
        backgroundColor: theme.colors.background, // Slight contrast
    },
    verifyButton: {
        width: '100%',
        borderRadius: theme.borderRadius.l,
        overflow: 'hidden',
        marginTop: theme.spacing.m,
        ...theme.shadows.primaryGlow,
    },
    gradientButton: {
        paddingVertical: theme.spacing.m,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: theme.spacing.s,
    },
    verifyButtonText: {
        color: theme.colors.surface,
        fontSize: theme.typography.sizes.m,
        fontWeight: 'bold',
    },
    resendContainer: {
        flexDirection: 'row',
        marginTop: theme.spacing.l,
        alignItems: 'center',
    },
    resendText: {
        color: theme.colors.text.secondary,
        fontSize: theme.typography.sizes.s,
    },
    timerText: {
        color: theme.colors.text.secondary,
        fontSize: theme.typography.sizes.s,
        fontWeight: '600',
    },
    resendLink: {
        color: theme.colors.primary,
        fontSize: theme.typography.sizes.s,
        fontWeight: 'bold',
    },
});
