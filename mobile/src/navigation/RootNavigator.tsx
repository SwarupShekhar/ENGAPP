import React from "react";
import { View, Text, StyleSheet as RNStyleSheet } from "react-native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import CreateProfileScreen from "../features/auth/screens/CreateProfileScreen";
import AssessmentIntroScreen from "../features/assessment/screens/AssessmentIntroScreen";
import AssessmentSpeakingScreen from "../features/assessment/screens/AssessmentSpeakingScreen";
import AssessmentResultScreen from "../features/assessment/screens/AssessmentResultScreen";
import CallScreen from "../features/call/screens/CallScreen";
import CallPreferenceScreenIndex from "../features/call/screens/CallPreferenceScreenIndex";
import CallFeedbackScreen from "../features/call/screens/CallFeedbackScreen";
import NotificationScreen from "../features/notification/screens/NotificationScreen";
import ConversationsScreen from "../features/chat/screens/ConversationsScreen";
import AITutorScreen from "../features/tutor/screens/AITutorScreen";
import ChatScreen from "../features/chat/screens/ChatScreen";
import SocketDebugScreen from "../features/debug/screens/SocketDebugScreen";
import ProfileScreenIndex from "../features/profile/screens/ProfileScreenIndex";
import PracticeTaskScreen from "../screens/practice/PracticeTaskScreen";
import ScoreDetailScreen from "../screens/score/ScoreDetailScreen";
import { useSuperApp } from "../context/SuperAppContext";
import EngrTabs from "./EngrTabs";
import EnglivoTabs from "./EnglivoTabs";
import ActiveCallScreen from "../features/englivo/screens/ActiveCallScreen";
import EnglivoBookingScreen from "../features/englivo/screens/EnglivoBookingScreen";
import EnglivoSessionModeScreen from "../features/englivo/screens/EnglivoSessionModeScreen";
import EnglivoAiConversationScreen from "../features/englivo/screens/EnglivoAiConversationScreen";
import EnglivoActiveCallScreen from "../features/englivo/screens/EnglivoActiveCallScreen";
import TutorConnectPreferenceScreen from '../features/englivo/screens/TutorConnectPreferenceScreen'

// Safe wrapper for InCallScreen — LiveKit requires native modules
// that are not available in Expo Go. This defers the import.
let RealInCallScreen: React.ComponentType<any> | null = null;
try {
  RealInCallScreen = require("../features/call/screens/InCallScreen").default;
} catch (e) {
  console.error("[InCallScreen Load Error]:", e);
  console.warn(
    "[LiveKit] Native module not available — InCallScreen disabled (Expo Go mode)",
  );
}

function InCallScreen(props: any) {
  if (RealInCallScreen) {
    return <RealInCallScreen {...props} />;
  }
  return (
    <View style={expoGoFallback.container}>
      <Text style={expoGoFallback.emoji}>📞</Text>
      <Text style={expoGoFallback.title}>Calling Not Available</Text>
      <Text style={expoGoFallback.subtitle}>
        LiveKit requires a development build.{"\n"}
        Run `npx expo run:ios` or `npx expo run:android` to test calls.
      </Text>
      <Text
        style={expoGoFallback.back}
        onPress={() => props.navigation.goBack()}
      >
        ← Go Back
      </Text>
    </View>
  );
}

// Safe wrapper for EnglivoLiveCallScreen — same LiveKit constraint
let RealEnglivoLiveCallScreen: React.ComponentType<any> | null = null;
try {
  RealEnglivoLiveCallScreen = require("../features/englivo/screens/EnglivoLiveCallScreen").default;
} catch (e) {
  console.warn("[LiveKit] EnglivoLiveCallScreen not available in Expo Go");
}

function EnglivoLiveCallScreen(props: any) {
  if (RealEnglivoLiveCallScreen) {
    return <RealEnglivoLiveCallScreen {...props} />;
  }
  return (
    <View style={expoGoFallback.container}>
      <Text style={expoGoFallback.emoji}>📞</Text>
      <Text style={expoGoFallback.title}>Calling Not Available</Text>
      <Text style={expoGoFallback.subtitle}>
        LiveKit requires a development build.{"\n"}
        Run `npx expo run:ios` or `npx expo run:android` to test calls.
      </Text>
      <Text
        style={expoGoFallback.back}
        onPress={() => props.navigation.goBack()}
      >
        ← Go Back
      </Text>
    </View>
  );
}

const expoGoFallback = RNStyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#0F172A",
    padding: 32,
  },
  emoji: { fontSize: 48, marginBottom: 16 },
  title: { color: "white", fontSize: 22, fontWeight: "bold", marginBottom: 8 },
  subtitle: {
    color: "#94A3B8",
    fontSize: 14,
    textAlign: "center",
    lineHeight: 22,
  },
  back: { color: "#818CF8", fontSize: 16, fontWeight: "600", marginTop: 24 },
});

const Stack = createNativeStackNavigator();

function ActiveTabs() {
  const { mode } = useSuperApp();
  return mode === "ENGR" ? <EngrTabs /> : <EnglivoTabs />;
}

function AITutorByMode(props: any) {
  const { mode } = useSuperApp();
  return mode === "ENGR" ? <AITutorScreen {...props} /> : <EnglivoAiConversationScreen {...props} />;
}

interface RootNavigatorProps {
  initialRoute: string;
}

export default function RootNavigator({ initialRoute }: RootNavigatorProps) {
  return (
    <Stack.Navigator
      initialRouteName={initialRoute}
      screenOptions={{ headerShown: false }}
    >
      <Stack.Screen name="MainTabs" component={ActiveTabs} />
      <Stack.Screen name="CreateProfile" component={CreateProfileScreen} />

      {/* Assessment Flow */}
      <Stack.Screen name="AssessmentIntro" component={AssessmentIntroScreen} />
      <Stack.Screen
        name="AssessmentSpeaking"
        component={AssessmentSpeakingScreen}
      />
      <Stack.Screen
        name="AssessmentResult"
        component={AssessmentResultScreen}
      />
      <Stack.Screen name="SocketDebug" component={SocketDebugScreen} />

      {/* screens accessible from logic/header */}
      <Stack.Screen name="Notifications" component={NotificationScreen} />
      <Stack.Screen name="Profile" component={ProfileScreenIndex} />
      <Stack.Screen name="Call" component={CallScreen} />

      <Stack.Screen
        name="CallPreference"
        component={CallPreferenceScreenIndex}
        options={{
          headerShown: false,
          presentation: "transparentModal",
          animation: "fade",
          contentStyle: { backgroundColor: "transparent" },
          animationDuration: 350,
        }}
      />

      {/* Call Flow */}
      <Stack.Screen
        name="InCall"
        component={InCallScreen}
        options={{ gestureEnabled: false }}
      />
      <Stack.Screen name="AITutor" component={AITutorByMode} />
      <Stack.Screen name="CallFeedback" component={CallFeedbackScreen} />
      <Stack.Screen name="ActiveCall" component={ActiveCallScreen} />
      <Stack.Screen name="EnglivoBooking" component={EnglivoBookingScreen} />
      <Stack.Screen name="EnglivoSessionMode" component={EnglivoSessionModeScreen} />
      <Stack.Screen name="EnglivoAiConversation" component={EnglivoAiConversationScreen} />
      <Stack.Screen name="EnglivoActiveCall" component={EnglivoActiveCallScreen} />
      <Stack.Screen
        name="TutorConnectPreference"
        component={TutorConnectPreferenceScreen}
      />
      <Stack.Screen
        name="EnglivoLiveCall"
        component={EnglivoLiveCallScreen}
        options={{ gestureEnabled: false }}
      />

      {/* Chat */}
      <Stack.Screen name="Conversations" component={ConversationsScreen} />
      <Stack.Screen name="Chat" component={ChatScreen} />

      {/* Practice Tasks */}
      <Stack.Screen name="PracticeTask" component={PracticeTaskScreen} />

      <Stack.Screen name="ScoreDetail" component={ScoreDetailScreen} />
    </Stack.Navigator>
  );
}
