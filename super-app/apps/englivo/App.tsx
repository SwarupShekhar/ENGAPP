import React, { useEffect, Component } from "react";
import { NavigationContainer } from "@react-navigation/native";
import { ClerkProvider, useAuth } from "@clerk/clerk-expo";
import { StatusBar } from "expo-status-bar";
import {
  View,
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaProvider } from "react-native-safe-area-context";
import Constants from "expo-constants";

import RootNavigator from "./src/navigation/RootNavigator";
import AuthNavigator from "./src/navigation/AuthNavigator";
import { navigationRef } from "./src/navigation/navigationRef";
import { tokenCache } from "./src/utils/tokenCache";
import { setAuthTokenFetcher } from "./src/api/client";
import { ThemeProvider } from "./src/theme/ThemeProvider";
import { UIVariantProvider } from "./src/context/UIVariantContext";

const CLERK_PUBLISHABLE_KEY =
  (Constants.expoConfig as any)?.extra?.clerkPublishableKey ||
  "pk_test_ZGVzdGluZWQtc3VuZmlzaC03OS5jbGVyay5hY2NvdW50cy5kZXYk";

class AppErrorBoundary extends Component<
  { children: React.ReactNode },
  { hasError: boolean; error: Error | null }
> {
  state = { hasError: false, error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("[Englivo] ErrorBoundary caught:", error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <View style={styles.errorContainer}>
          <Ionicons name="warning" size={48} color="#F59E0B" />
          <Text style={styles.errorTitle}>Something went wrong</Text>
          <Text style={styles.errorDetail}>
            {this.state.error?.message || "An error occurred"}
          </Text>
          <TouchableOpacity
            style={styles.retryButton}
            onPress={() => this.setState({ hasError: false, error: null })}
          >
            <Text style={styles.retryText}>Try again</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return this.props.children;
  }
}

function AuthTokenInjector({ children }: { children: React.ReactNode }) {
  const { getToken } = useAuth();

  useEffect(() => {
    setAuthTokenFetcher(getToken);
  }, [getToken]);

  return <>{children}</>;
}

function AuthGate() {
  const { isLoaded, isSignedIn } = useAuth();

  if (!isLoaded) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#F59E0B" />
        <Text style={styles.loadingLabel}>Loading…</Text>
      </View>
    );
  }

  if (isSignedIn) {
    return <RootNavigator />;
  }

  return <AuthNavigator />;
}

export default function App() {
  return (
    <ClerkProvider publishableKey={CLERK_PUBLISHABLE_KEY} tokenCache={tokenCache}>
      <SafeAreaProvider>
        <ThemeProvider>
          <AppErrorBoundary>
            <UIVariantProvider>
              <NavigationContainer
                ref={navigationRef}
                theme={{
                  dark: true,
                  colors: {
                    primary: "#F59E0B",
                    background: "#0F172A",
                    card: "#1E293B",
                    text: "#F8FAFC",
                    border: "#334155",
                    notification: "#F59E0B",
                  },
                  fonts: {
                    regular: { fontFamily: "System", fontWeight: "400" as const },
                    medium: { fontFamily: "System", fontWeight: "500" as const },
                    bold: { fontFamily: "System", fontWeight: "700" as const },
                    heavy: { fontFamily: "System", fontWeight: "900" as const },
                  },
                }}
              >
                <StatusBar style="light" />
                <AuthTokenInjector>
                  <AuthGate />
                </AuthTokenInjector>
              </NavigationContainer>
            </UIVariantProvider>
          </AppErrorBoundary>
        </ThemeProvider>
      </SafeAreaProvider>
    </ClerkProvider>
  );
}

const styles = StyleSheet.create({
  errorContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#0F172A",
    padding: 24,
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#F8FAFC",
    marginTop: 16,
    marginBottom: 8,
  },
  errorDetail: {
    fontSize: 14,
    color: "#94A3B8",
    textAlign: "center",
    marginBottom: 24,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#0F172A",
    padding: 20,
  },
  loadingLabel: {
    marginTop: 12,
    fontSize: 14,
    color: "#94A3B8",
  },
  retryButton: {
    backgroundColor: "#F59E0B",
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  retryText: {
    color: "#0F172A",
    fontSize: 14,
    fontWeight: "600",
  },
});
