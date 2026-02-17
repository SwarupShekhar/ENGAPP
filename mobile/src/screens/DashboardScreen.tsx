import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, StatusBar } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { theme } from '../theme/theme';

export default function DashboardScreen() {
    const navigation: any = useNavigation();

    return (
        <View style={styles.container}>
            <StatusBar barStyle="dark-content" />
            <SafeAreaView style={styles.safeArea}>
                <Animated.View entering={FadeInDown.delay(100).springify()} style={styles.header}>
                    <Text style={styles.title}>Dashboard</Text>
                    <Text style={styles.subtitle}>Your learning overview</Text>
                </Animated.View>

                <Animated.View entering={FadeInDown.delay(200).springify()} style={styles.card}>
                    <View style={styles.cardIcon}>
                        <Ionicons name="bar-chart" size={40} color={theme.colors.primaryLight} />
                    </View>
                    <Text style={styles.cardTitle}>Coming Soon</Text>
                    <Text style={styles.cardDesc}>
                        Your detailed learning analytics and insights will be available here.
                    </Text>
                    <TouchableOpacity
                        style={styles.goBtn}
                        activeOpacity={0.8}
                        onPress={() => navigation.navigate('MainTabs', { screen: 'Home' })}
                    >
                        <LinearGradient
                            colors={theme.colors.gradients.primary}
                            style={styles.goBtnGradient}
                        >
                            <Ionicons name="home" size={16} color="white" />
                            <Text style={styles.goBtnText}>Go to Home</Text>
                        </LinearGradient>
                    </TouchableOpacity>
                </Animated.View>
            </SafeAreaView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#F0F2F8',
    },
    safeArea: {
        flex: 1,
    },
    header: {
        paddingHorizontal: theme.spacing.l,
        marginTop: theme.spacing.m,
        marginBottom: theme.spacing.xl,
    },
    title: {
        fontSize: theme.typography.sizes.xxl,
        fontWeight: 'bold',
        color: theme.colors.text.primary,
        marginBottom: 4,
    },
    subtitle: {
        fontSize: theme.typography.sizes.m,
        color: theme.colors.text.secondary,
    },
    card: {
        margin: theme.spacing.l,
        backgroundColor: 'rgba(255,255,255,0.85)',
        borderRadius: theme.borderRadius.xl,
        padding: theme.spacing.xl,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.6)',
        ...theme.shadows.medium,
    },
    cardIcon: {
        width: 80,
        height: 80,
        borderRadius: 40,
        backgroundColor: theme.colors.primary + '10',
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: theme.spacing.l,
    },
    cardTitle: {
        fontSize: theme.typography.sizes.xl,
        fontWeight: 'bold',
        color: theme.colors.text.primary,
        marginBottom: theme.spacing.s,
    },
    cardDesc: {
        fontSize: theme.typography.sizes.m,
        color: theme.colors.text.secondary,
        textAlign: 'center',
        lineHeight: 22,
        marginBottom: theme.spacing.xl,
    },
    goBtn: {
        borderRadius: theme.borderRadius.l,
        overflow: 'hidden',
        ...theme.shadows.primaryGlow,
    },
    goBtnGradient: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: theme.spacing.xl,
        paddingVertical: theme.spacing.m,
        gap: 8,
    },
    goBtnText: {
        color: 'white',
        fontSize: theme.typography.sizes.m,
        fontWeight: 'bold',
    },
});
