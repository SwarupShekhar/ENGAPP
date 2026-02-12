import React, { useEffect, useState } from "react";
import { NavigationContainer } from "@react-navigation/native";
import { ClerkProvider, SignedIn, SignedOut, useAuth, useUser } from "@clerk/clerk-expo";
import RootNavigator from "./navigation/RootNavigator";
import AuthNavigator from "./navigation/AuthNavigator";
import { StatusBar } from "expo-status-bar";
import { tokenCache } from "./utils/tokenCache";
import { setAuthTokenFetcher } from "./api/client";
import { View, ActivityIndicator, StyleSheet } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

// Ideally this should be in an .env file, but for now hardcoding as retrieved
const CLERK_PUBLISHABLE_KEY = "pk_test_ZGVzdGluZWQtc3VuZmlzaC03OS5jbGVyay5hY2NvdW50cy5kZXYk";

function AuthTokenInjector({ children }: { children: React.ReactNode }) {
  const { getToken } = useAuth();

  useEffect(() => {
    setAuthTokenFetcher(getToken);
  }, [getToken]);

  return <>{children}</>;
}

/**
 * OnboardingGate checks if the signed-in user has completed:
 * 1. Profile creation (firstName exists)
 * 2. Initial assessment (unsafeMetadata.assessmentCompleted === true)
 *
 * It passes the initial route to RootNavigator accordingly.
 */
function OnboardingGate() {
  const { user, isLoaded } = useUser();
  const [initialRoute, setInitialRoute] = useState<string | null>(null);

  useEffect(() => {
    if (!isLoaded || !user) return;

    const hasProfile = !!(user.unsafeMetadata as any)?.profileCompleted;
    const hasCompletedAssessment = !!(user.unsafeMetadata as any)?.assessmentCompleted;

    if (!hasProfile) {
      setInitialRoute("CreateProfile");
    } else if (!hasCompletedAssessment) {
      setInitialRoute("AssessmentIntro");
    } else {
      setInitialRoute("MainTabs");
    }
  }, [isLoaded, user]);

  if (!initialRoute) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#6C5CE7" />
      </View>
    );
  }

  return <RootNavigator initialRoute={initialRoute} />;
}

export default function App() {
  return (
    <ClerkProvider publishableKey={CLERK_PUBLISHABLE_KEY} tokenCache={tokenCache}>
      <AuthTokenInjector>
        <SafeAreaProvider>
          <NavigationContainer>
            <StatusBar style="auto" />
            <SignedIn>
              <OnboardingGate />
            </SignedIn>
            <SignedOut>
              <AuthNavigator onLoginSuccess={() => { }} />
            </SignedOut>
          </NavigationContainer>
        </SafeAreaProvider>
      </AuthTokenInjector>
    </ClerkProvider>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F5F6FA',
  },
});
