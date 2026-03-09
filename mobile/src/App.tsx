import React, { useEffect, useState, Component } from "react";
import { NavigationContainer } from "@react-navigation/native";
import { ClerkProvider, useAuth, useUser } from "@clerk/clerk-expo";
import RootNavigator from "./navigation/RootNavigator";
import { navigationRef, navigate } from "./navigation/navigationRef";
import AuthNavigator from "./navigation/AuthNavigator";
import { StatusBar } from "expo-status-bar";
import { tokenCache } from "./utils/tokenCache";
import { setAuthTokenFetcher } from "./api/client";
import {
  View,
  ActivityIndicator,
  StyleSheet,
  AppState,
  Alert,
  Text,
  TouchableOpacity,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaProvider } from "react-native-safe-area-context";
import SocketService from "./services/socketService";
import FeedPrefetchService from "./services/feedPrefetchService";
import { ThemeProvider } from "./theme/ThemeProvider";

class AppErrorBoundary extends Component<
  { children: React.ReactNode },
  { hasError: boolean; error: Error | null }
> {
  state = { hasError: false, error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("[App] ErrorBoundary caught:", error, errorInfo);
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

// Ideally this should be in an .env file, but for now hardcoding as retrieved
const CLERK_PUBLISHABLE_KEY =
  "pk_test_ZGVzdGluZWQtc3VuZmlzaC03OS5jbGVyay5hY2NvdW50cy5kZXYk";

function AuthTokenInjector({ children }: { children: React.ReactNode }) {
  const { getToken } = useAuth();

  useEffect(() => {
    setAuthTokenFetcher(getToken);
  }, [getToken]);

  return <>{children}</>;
}

function AppSocketHandler({ children }: { children: React.ReactNode }) {
  const { getToken, userId, isSignedIn } = useAuth();
  const socketService = SocketService.getInstance();

  useEffect(() => {
    let mounted = true;

    const connectSocket = async () => {
      if (isSignedIn && userId) {
        try {
          // Pass the getToken function directly so socket.io can
          // fetch a fresh Clerk JWT on every connection/reconnection attempt
          socketService.connect(() => getToken(), userId);
        } catch (err) {
          console.warn("[App] Socket connection failed:", err);
        }
      } else {
        socketService.disconnect();
      }
    };

    connectSocket();

    const subscription = AppState.addEventListener("change", (nextAppState) => {
      if (nextAppState === "active" && isSignedIn) {
        connectSocket();
      }
    });

    // Incoming Call Listener
    const handleIncomingCall = (data: {
      initiatorName: string;
      sessionId: string;
      callType: string;
      conversationId: string;
    }) => {
      console.log("[App] Incoming call received:", data);
      Alert.alert(
        "Incoming Call",
        `${data.initiatorName} is calling you...`,
        [
          {
            text: "Decline",
            style: "cancel",
            onPress: () => {
              console.log("[App] Declining call:", data.conversationId);
              socketService.declineCall(data.conversationId);
            },
          },
          {
            text: "Accept",
            onPress: () => {
              console.log("[App] Accepting call:", data.conversationId);
              socketService.acceptCall(data.conversationId, (res: any) => {
                console.log("[App] Call accepted, response:", res);
                const realId = res?.sessionId || data.sessionId;
                navigate("InCall", {
                  sessionId: realId,
                  partnerName: data.initiatorName,
                  isDirect: true,
                  conversationId: data.conversationId,
                });
              });
            },
          },
        ],
        { cancelable: false },
      );
    };

    socketService.onIncomingCall(handleIncomingCall);

    // Friend Request Listener
    const handleFriendRequest = (data: {
      senderName: string;
      requestId: string;
    }) => {
      console.log("[App] Friend request received:", data);
      Alert.alert(
        "New Friend Request",
        `${data.senderName} sent you a friend request!`,
        [
          { text: "View Later", style: "cancel" },
          {
            text: "View Now",
            onPress: () => {
              navigate("Notifications");
            },
          },
        ],
      );
    };

    socketService.onFriendRequest(handleFriendRequest);

    return () => {
      mounted = false;
      subscription.remove();
      socketService.offIncomingCall(handleIncomingCall);
      socketService.offFriendRequest(handleFriendRequest);
    };
  }, [isSignedIn, userId]);

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
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let timeout: NodeJS.Timeout;

    if (!isLoaded || !user) {
      // If it takes more than 10s to load user data, show an error (likely API unreachable)
      timeout = setTimeout(() => {
        if (!initialRoute) {
          console.warn("[OnboardingGate] Timed out waiting for user data");
          setError("Connection timed out. Please check your internet.");
        }
      }, 10000);
      return () => clearTimeout(timeout);
    }

    const hasProfile = !!(user.unsafeMetadata as any)?.profileCompleted;
    const hasCompletedAssessment = !!(user.unsafeMetadata as any)
      ?.assessmentCompleted;

    if (!hasProfile) {
      setInitialRoute("CreateProfile");
    } else if (!hasCompletedAssessment) {
      setInitialRoute("AssessmentIntro");
    } else {
      setInitialRoute("MainTabs");
      // Use the injected token automatically, but delay slightly to ensure
      // the AuthTokenInjector's useEffect has completed
      setTimeout(() => {
        FeedPrefetchService.getInstance().prefetch();
      }, 500);
    }
  }, [isLoaded, user]);

  const handleRetry = () => {
    setError(null);
    // This will trigger a re-render and re-run the effect
  };

  if (error) {
    return (
      <View style={styles.loadingContainer}>
        <Ionicons name="cloud-offline-outline" size={48} color="#FF6B6B" />
        <Text style={styles.errorText}>{error}</Text>
        <TouchableOpacity style={styles.retryButton} onPress={handleRetry}>
          <Text style={styles.retryText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!initialRoute) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#6C5CE7" />
      </View>
    );
  }

  return <RootNavigator initialRoute={initialRoute} />;
}

/**
 * Renders content only after auth is loaded. When Clerk is still loading,
 * SignedIn/SignedOut both render nothing → blank screen. So we show a loading
 * screen until isLoaded, then render the correct branch.
 */
function AuthGate() {
  const { isLoaded, isSignedIn } = useAuth();

  if (!isLoaded) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#6C5CE7" />
        <Text style={styles.loadingLabel}>Loading…</Text>
      </View>
    );
  }

  if (isSignedIn) {
    return <OnboardingGate />;
  }

  return <AuthNavigator onLoginSuccess={() => {}} />;
}

export default function App() {
  return (
    <ClerkProvider
      publishableKey={CLERK_PUBLISHABLE_KEY}
      tokenCache={tokenCache}
    >
      <AuthTokenInjector>
        <AppSocketHandler>
          <SafeAreaProvider>
            <ThemeProvider>
              <AppErrorBoundary>
                <View style={styles.appRoot}>
                  <NavigationContainer
                    ref={navigationRef}
                    theme={{
                      dark: false,
                      colors: {
                        primary: "#6C5CE7",
                        background: "#F5F6FA",
                        card: "#FFFFFF",
                        text: "#1F2937",
                        border: "#E5E7EB",
                        notification: "#6C5CE7",
                      },
                      fonts: {
                        regular: {
                          fontFamily: "System",
                          fontWeight: "400" as const,
                        },
                        medium: {
                          fontFamily: "System",
                          fontWeight: "500" as const,
                        },
                        bold: {
                          fontFamily: "System",
                          fontWeight: "700" as const,
                        },
                        heavy: {
                          fontFamily: "System",
                          fontWeight: "900" as const,
                        },
                      },
                    }}
                  >
                    <StatusBar style="auto" />
                    <AuthGate />
                  </NavigationContainer>
                </View>
              </AppErrorBoundary>
            </ThemeProvider>
          </SafeAreaProvider>
        </AppSocketHandler>
      </AuthTokenInjector>
    </ClerkProvider>
  );
}

const styles = StyleSheet.create({
  appRoot: {
    flex: 1,
    backgroundColor: "#F5F6FA",
  },
  errorContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#F5F6FA",
    padding: 24,
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#1F2937",
    marginTop: 16,
    marginBottom: 8,
  },
  errorDetail: {
    fontSize: 14,
    color: "#6B7280",
    textAlign: "center",
    marginBottom: 24,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#F5F6FA",
    padding: 20,
  },
  loadingLabel: {
    marginTop: 12,
    fontSize: 14,
    color: "#6B7280",
  },
  errorText: {
    fontSize: 16,
    color: "#2D3436",
    textAlign: "center",
    marginTop: 16,
    marginBottom: 24,
  },
  retryButton: {
    backgroundColor: "#6C5CE7",
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  retryText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "600",
  },
});
