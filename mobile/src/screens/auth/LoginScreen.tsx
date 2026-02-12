import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { AntDesign, Ionicons } from '@expo/vector-icons';
import { theme } from '../../theme/theme';
import { useSignIn, useSignUp, useOAuth } from '@clerk/clerk-expo';
import * as WebBrowser from 'expo-web-browser';

// Required for OAuth redirect
WebBrowser.maybeCompleteAuthSession();

export default function LoginScreen({ navigation }: any) {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [isSignUpMode, setIsSignUpMode] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(false);

    const [verificationCode, setVerificationCode] = useState('');
    const [pendingVerification, setPendingVerification] = useState(false);

    const { signIn, isLoaded: isSignInLoaded, setActive: setSignInActive } = useSignIn();
    const { signUp, isLoaded: isSignUpLoaded, setActive: setSignUpActive } = useSignUp();
    const { startOAuthFlow: startGoogleOAuth } = useOAuth({ strategy: 'oauth_google' });

    const handleEmailAuth = async () => {
        if (!email || !password) {
            Alert.alert("Error", "Please enter both email and password.");
            return;
        }

        setLoading(true);

        try {
            if (isSignUpMode) {
                // Sign Up flow
                if (!isSignUpLoaded) return;

                await signUp.create({
                    emailAddress: email,
                    password: password,
                });

                // Start verification
                await signUp.prepareEmailAddressVerification({ strategy: 'email_code' });
                setPendingVerification(true);
                Alert.alert("Verify Email", "An OTP has been sent to your email.");
            } else {
                // Sign In flow
                if (!isSignInLoaded) return;

                const result = await signIn.create({
                    identifier: email,
                    password: password,
                });

                if (result.status === 'complete') {
                    await setSignInActive({ session: result.createdSessionId });
                } else {
                    Alert.alert("Error", "Login incomplete. Please try again.");
                }
            }
        } catch (err: any) {
            const errorMessage = err.errors?.[0]?.longMessage || err.errors?.[0]?.message || "Authentication failed.";
            Alert.alert("Error", errorMessage);
        } finally {
            setLoading(false);
        }
    };

    const handleVerify = async () => {
        if (!isSignUpLoaded || !verificationCode) return;

        setLoading(true);
        try {
            const result = await signUp.attemptEmailAddressVerification({
                code: verificationCode,
            });

            if (result.status === 'complete') {
                await setSignUpActive({ session: result.createdSessionId });
            } else {
                Alert.alert("Error", "Verification failed. Please check the code.");
            }
        } catch (err: any) {
            const errorMessage = err.errors?.[0]?.longMessage || err.errors?.[0]?.message || "Verification failed.";
            Alert.alert("Error", errorMessage);
        } finally {
            setLoading(false);
        }
    };

    const handleGoogleAuth = async () => {
        try {
            setLoading(true);
            const { createdSessionId, setActive } = await startGoogleOAuth();

            if (createdSessionId && setActive) {
                await setActive({ session: createdSessionId });
                // Navigation handled by App.tsx (SignedIn/SignedOut)
            }
        } catch (err: any) {
            const errorMessage = err.errors?.[0]?.message || "Google sign-in failed.";
            Alert.alert("Error", errorMessage);
        } finally {
            setLoading(false);
        }
    };

    return (
        <View style={styles.container}>
            <LinearGradient
                colors={theme.colors.gradients.primary}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.headerBackground}
            />

            <SafeAreaView style={styles.safeArea}>
                <KeyboardAvoidingView
                    behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                    style={styles.keyboardView}
                >
                    <View style={styles.logoContainer}>
                        <View style={styles.logoCircle}>
                            <Text style={styles.logoText}>ER</Text>
                        </View>
                        <Text style={styles.welcomeText}>
                            {isSignUpMode ? 'Create Account' : 'Welcome back'}
                        </Text>
                        <Text style={styles.subText}>
                            {isSignUpMode ? 'Start your learning journey' : 'Login to continue your journey'}
                        </Text>
                    </View>

                    <View style={styles.formContainer}>
                        {!pendingVerification ? (
                            <>
                                {/* Email Input */}
                                <View style={styles.inputContainer}>
                                    <Ionicons name="mail-outline" size={20} color={theme.colors.text.secondary} />
                                    <TextInput
                                        style={styles.input}
                                        placeholder="Enter your email"
                                        placeholderTextColor={theme.colors.text.secondary}
                                        keyboardType="email-address"
                                        autoCapitalize="none"
                                        autoCorrect={false}
                                        value={email}
                                        onChangeText={setEmail}
                                    />
                                </View>

                                {/* Password Input */}
                                <View style={styles.inputContainer}>
                                    <Ionicons name="lock-closed-outline" size={20} color={theme.colors.text.secondary} />
                                    <TextInput
                                        style={styles.input}
                                        placeholder="Enter your password"
                                        placeholderTextColor={theme.colors.text.secondary}
                                        secureTextEntry={!showPassword}
                                        autoCapitalize="none"
                                        value={password}
                                        onChangeText={setPassword}
                                    />
                                    <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
                                        <Ionicons
                                            name={showPassword ? "eye-off-outline" : "eye-outline"}
                                            size={20}
                                            color={theme.colors.text.secondary}
                                        />
                                    </TouchableOpacity>
                                </View>

                                {/* Sign In / Sign Up Button */}
                                <TouchableOpacity
                                    style={styles.primaryButton}
                                    activeOpacity={0.9}
                                    onPress={handleEmailAuth}
                                    disabled={loading}
                                >
                                    <LinearGradient
                                        colors={theme.colors.gradients.secondary}
                                        start={{ x: 0, y: 0 }}
                                        end={{ x: 1, y: 0 }}
                                        style={styles.gradientButton}
                                    >
                                        {loading ? (
                                            <ActivityIndicator color={theme.colors.surface} />
                                        ) : (
                                            <Text style={styles.primaryButtonText}>
                                                {isSignUpMode ? 'Create Account' : 'Sign In'}
                                            </Text>
                                        )}
                                    </LinearGradient>
                                </TouchableOpacity>
                            </>
                        ) : (
                            <>
                                {/* Verification Code Input */}
                                <Text style={styles.verificationHint}>
                                    Enter the 6-digit code sent to {email}
                                </Text>
                                <View style={styles.inputContainer}>
                                    <Ionicons name="key-outline" size={20} color={theme.colors.text.secondary} />
                                    <TextInput
                                        style={styles.input}
                                        placeholder="Verification Code"
                                        placeholderTextColor={theme.colors.text.secondary}
                                        keyboardType="number-pad"
                                        maxLength={6}
                                        value={verificationCode}
                                        onChangeText={setVerificationCode}
                                    />
                                </View>

                                <TouchableOpacity
                                    style={styles.primaryButton}
                                    activeOpacity={0.9}
                                    onPress={handleVerify}
                                    disabled={loading || verificationCode.length < 6}
                                >
                                    <LinearGradient
                                        colors={theme.colors.gradients.secondary}
                                        start={{ x: 0, y: 0 }}
                                        end={{ x: 1, y: 0 }}
                                        style={styles.gradientButton}
                                    >
                                        {loading ? (
                                            <ActivityIndicator color={theme.colors.surface} />
                                        ) : (
                                            <Text style={styles.primaryButtonText}>Verify & Continue</Text>
                                        )}
                                    </LinearGradient>
                                </TouchableOpacity>

                                <TouchableOpacity
                                    style={styles.toggleContainer}
                                    onPress={() => setPendingVerification(false)}
                                >
                                    <Text style={styles.toggleLink}>Change Email</Text>
                                </TouchableOpacity>
                            </>
                        )}

                        {!pendingVerification && (
                            <>
                                <View style={styles.dividerContainer}>
                                    <View style={styles.divider} />
                                    <Text style={styles.dividerText}>OR</Text>
                                    <View style={styles.divider} />
                                </View>

                                {/* Google Sign In */}
                                <TouchableOpacity
                                    style={styles.googleButton}
                                    onPress={handleGoogleAuth}
                                    disabled={loading}
                                >
                                    <AntDesign name="google" size={22} color="#DB4437" />
                                    <Text style={styles.googleButtonText}>Continue with Google</Text>
                                </TouchableOpacity>

                                {/* Toggle Sign In / Sign Up */}
                                <TouchableOpacity
                                    style={styles.toggleContainer}
                                    onPress={() => setIsSignUpMode(!isSignUpMode)}
                                >
                                    <Text style={styles.toggleText}>
                                        {isSignUpMode
                                            ? 'Already have an account? '
                                            : "Don't have an account? "}
                                        <Text style={styles.toggleLink}>
                                            {isSignUpMode ? 'Sign In' : 'Sign Up'}
                                        </Text>
                                    </Text>
                                </TouchableOpacity>
                            </>
                        )}
                    </View>
                </KeyboardAvoidingView>
            </SafeAreaView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: theme.colors.background,
    },
    headerBackground: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: '40%',
        borderBottomLeftRadius: 40,
        borderBottomRightRadius: 40,
    },
    safeArea: {
        flex: 1,
    },
    keyboardView: {
        flex: 1,
        justifyContent: 'center',
    },
    logoContainer: {
        alignItems: 'center',
        marginBottom: theme.spacing.xl,
    },
    logoCircle: {
        width: 80,
        height: 80,
        borderRadius: theme.borderRadius.circle,
        backgroundColor: theme.colors.surface,
        justifyContent: 'center',
        alignItems: 'center',
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.1,
        shadowRadius: 10,
        elevation: 8,
        marginBottom: theme.spacing.m,
    },
    logoText: {
        fontSize: theme.typography.sizes.xl,
        fontWeight: 'bold',
        color: theme.colors.primary,
    },
    welcomeText: {
        fontSize: theme.typography.sizes.xxl,
        fontWeight: 'bold',
        color: theme.colors.surface,
        marginBottom: theme.spacing.xs,
    },
    subText: {
        fontSize: theme.typography.sizes.m,
        color: theme.colors.surface,
        opacity: 0.9,
    },
    formContainer: {
        backgroundColor: theme.colors.surface,
        marginHorizontal: theme.spacing.m,
        padding: theme.spacing.l,
        borderRadius: theme.borderRadius.xl,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.05,
        shadowRadius: 20,
        elevation: 5,
    },
    inputContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: theme.colors.background,
        borderRadius: theme.borderRadius.m,
        paddingHorizontal: theme.spacing.m,
        height: 56,
        borderWidth: 1,
        borderColor: theme.colors.border,
        marginBottom: theme.spacing.m,
        gap: theme.spacing.s,
    },
    input: {
        flex: 1,
        fontSize: theme.typography.sizes.m,
        color: theme.colors.text.primary,
    },
    primaryButton: {
        borderRadius: theme.borderRadius.m,
        overflow: 'hidden',
        marginTop: theme.spacing.s,
        ...theme.shadows.primaryGlow,
    },
    gradientButton: {
        paddingVertical: theme.spacing.m,
        alignItems: 'center',
        justifyContent: 'center',
    },
    primaryButtonText: {
        color: theme.colors.surface,
        fontSize: theme.typography.sizes.m,
        fontWeight: 'bold',
    },
    dividerContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        marginVertical: theme.spacing.l,
    },
    divider: {
        flex: 1,
        height: 1,
        backgroundColor: theme.colors.border,
    },
    dividerText: {
        marginHorizontal: theme.spacing.m,
        color: theme.colors.text.secondary,
        fontSize: theme.typography.sizes.s,
        fontWeight: '500',
    },
    googleButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: theme.spacing.m,
        backgroundColor: theme.colors.background,
        borderRadius: theme.borderRadius.m,
        borderWidth: 1,
        borderColor: theme.colors.border,
        gap: theme.spacing.s,
    },
    googleButtonText: {
        fontSize: theme.typography.sizes.m,
        fontWeight: '600',
        color: theme.colors.text.primary,
    },
    verificationHint: {
        fontSize: theme.typography.sizes.s,
        color: theme.colors.text.secondary,
        textAlign: 'center',
        marginBottom: theme.spacing.m,
    },
    toggleContainer: {
        alignItems: 'center',
        marginTop: theme.spacing.l,
    },
    toggleText: {
        fontSize: theme.typography.sizes.s,
        color: theme.colors.text.secondary,
    },
    toggleLink: {
        color: theme.colors.primary,
        fontWeight: 'bold',
    },
});
