import React from "react";
import { View, Text, StyleSheet as RNStyleSheet } from "react-native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import AssessmentScreen from "../features/assessment/screens/AssessmentScreen";
import ProgressScreen from "../features/progress/screens/ProgressScreen";
import ProfileScreen from "../features/profile/screens/ProfileScreen";
import FeedbackScreen from "../features/feedback/screens/FeedbackScreen";
import CallScreen from "../features/call/screens/CallScreen";
import CallPreferenceScreen from "../features/call/screens/CallPreferenceScreen";
import PracticeScreen from "../features/session/screens/PracticeScreen";
import CallFeedbackScreen from "../features/call/screens/CallFeedbackScreen";
import NotificationScreen from "../features/notification/screens/NotificationScreen";
import ConversationsScreen from "../features/chat/screens/ConversationsScreen";
import CreateProfileScreen from "../features/auth/screens/CreateProfileScreen";
import AssessmentIntroScreen from "../features/assessment/screens/AssessmentIntroScreen";
import AssessmentSpeakingScreen from "../features/assessment/screens/AssessmentSpeakingScreen";
import AssessmentResultScreen from "../features/assessment/screens/AssessmentResultScreen";
import AITutorScreen from "../features/tutor/screens/AITutorScreen";
import ChatScreen from "../features/chat/screens/ChatScreen";
import SocketDebugScreen from "../features/debug/screens/SocketDebugScreen";
import CustomTabBar from "../components/navigation/CustomTabBar";
import EBitesScreen from "../features/reels/screens/EBitesScreen";
import HomeScreen from "../features/home/screens/HomeScreen";

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

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

function MainTabs() {
  return (
    <Tab.Navigator
      tabBar={(props) => <CustomTabBar {...props} />}
      screenOptions={{ headerShown: false }}
    >
      <Tab.Screen name="Home" component={HomeScreen} />
      <Tab.Screen name="Feedback" component={FeedbackScreen} />
      <Tab.Screen
        name="Call"
        component={View} // Placeholder, handled by CustomTabBar
        listeners={({ navigation }) => ({
          tabPress: (e) => {
            e.preventDefault();
            navigation.navigate("CallPreference");
          },
        })}
      />
      <Tab.Screen name="eBites" component={EBitesScreen} />
      <Tab.Screen name="Progress" component={ProgressScreen} />
    </Tab.Navigator>
  );
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
      <Stack.Screen name="MainTabs" component={MainTabs} />
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
      <Stack.Screen name="Profile" component={ProfileScreen} />
      <Stack.Screen name="Call" component={CallScreen} />

      <Stack.Screen
        name="CallPreference"
        component={CallPreferenceScreen}
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
      <Stack.Screen name="AITutor" component={AITutorScreen} />
      <Stack.Screen name="CallFeedback" component={CallFeedbackScreen} />

      {/* Chat */}
      <Stack.Screen name="Conversations" component={ConversationsScreen} />
      <Stack.Screen name="Chat" component={ChatScreen} />
    </Stack.Navigator>
  );
}
