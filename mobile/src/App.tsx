import React, { useEffect, useState } from "react";
import { NavigationContainer } from "@react-navigation/native";
import { ClerkProvider, SignedIn, SignedOut, useAuth, useUser } from "@clerk/clerk-expo";
import RootNavigator from "./navigation/RootNavigator";
import { navigationRef, navigate } from "./navigation/navigationRef";
import AuthNavigator from "./navigation/AuthNavigator";
import { StatusBar } from "expo-status-bar";
import { tokenCache } from "./utils/tokenCache";
import { setAuthTokenFetcher } from "./api/client";
import { View, ActivityIndicator, StyleSheet, AppState, Alert } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import SocketService from "./services/socketService";

// Ideally this should be in an .env file, but for now hardcoding as retrieved
const CLERK_PUBLISHABLE_KEY = "pk_test_ZGVzdGluZWQtc3VuZmlzaC03OS5jbGVyay5hY2NvdW50cy5kZXYk";

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
          const token = await getToken();
          if (token && mounted) {
            socketService.connect(token);
          }
        } catch (err) {
          console.warn("[App] Socket connection failed:", err);
        }
      } else {
        socketService.disconnect();
      }
    };

    connectSocket();

    const subscription = AppState.addEventListener('change', nextAppState => {
      if (nextAppState === 'active' && isSignedIn) {
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
            }
          },
          { 
            text: "Accept", 
            onPress: () => {
              console.log("[App] Accepting call:", data.conversationId);
              socketService.acceptCall(data.conversationId, (res: any) => {
                console.log("[App] Call accepted, response:", res);
                const realId = res?.sessionId || data.sessionId;
                navigate('InCall', { 
                  sessionId: realId, 
                  partnerName: data.initiatorName,
                  isDirect: true,
                  conversationId: data.conversationId
                });
              });
            }
          }
        ],
        { cancelable: false }
      );
    };

    socketService.onIncomingCall(handleIncomingCall);

    return () => {
      mounted = false;
      subscription.remove();
      socketService.offIncomingCall(handleIncomingCall);
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
        <AppSocketHandler>
          <SafeAreaProvider>
            <NavigationContainer ref={navigationRef}>
              <StatusBar style="auto" />
              <SignedIn>
                <OnboardingGate />
              </SignedIn>
              <SignedOut>
                <AuthNavigator onLoginSuccess={() => { }} />
              </SignedOut>
            </NavigationContainer>
          </SafeAreaProvider>
        </AppSocketHandler>
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
