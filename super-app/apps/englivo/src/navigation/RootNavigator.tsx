import React from "react";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";
import { View, StyleSheet, TouchableOpacity, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAppTheme } from "../theme/useAppTheme";

import HomeScreen from "../features/home/screens/HomeScreen";
import SessionsScreen from "../features/sessions/screens/SessionsScreen";
import ProgressScreen from "../features/progress/screens/ProgressScreen";
import ProfileScreen from "../features/profile/screens/ProfileScreen";
import SessionModeScreen from "../features/sessions/screens/SessionModeScreen";
import BookingScreen from "../features/sessions/screens/BookingScreen";
import AiConversationScreen from "../features/aiTutor/screens/AiConversationScreen";
import ActiveCallScreen from "../features/aiTutor/screens/ActiveCallScreen";

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

function MainTabs() {
  const theme = useAppTheme();
  const insets = useSafeAreaInsets();

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: theme.colors.primary,
        tabBarInactiveTintColor: theme.colors.text.light,
        tabBarStyle: {
          backgroundColor: theme.colors.surface,
          borderTopColor: theme.colors.border,
          borderTopWidth: 1,
          paddingBottom: insets.bottom > 0 ? insets.bottom : 8,
          paddingTop: 8,
          height: 56 + (insets.bottom > 0 ? insets.bottom : 8),
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: "600",
          marginTop: 2,
        },
        tabBarIcon: ({ focused, color, size }) => {
          const icons: Record<string, [string, string]> = {
            Home: ["home", "home-outline"],
            Sessions: ["calendar", "calendar-outline"],
            Progress: ["bar-chart", "bar-chart-outline"],
            Profile: ["person", "person-outline"],
          };
          const [active, inactive] = icons[route.name] ?? ["ellipse", "ellipse-outline"];
          return (
            <Ionicons
              name={(focused ? active : inactive) as any}
              size={size}
              color={color}
            />
          );
        },
      })}
    >
      <Tab.Screen name="Home" component={HomeScreen} />
      <Tab.Screen name="Sessions" component={SessionsScreen} />
      <Tab.Screen name="Progress" component={ProgressScreen} />
      <Tab.Screen name="Profile" component={ProfileScreen} />
    </Tab.Navigator>
  );
}

export default function RootNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="MainTabs" component={MainTabs} />
      <Stack.Screen name="SessionMode" component={SessionModeScreen} />
      <Stack.Screen name="Booking" component={BookingScreen} />
      <Stack.Screen name="AiConversation" component={AiConversationScreen} />
      <Stack.Screen name="ActiveCall" component={ActiveCallScreen} />
    </Stack.Navigator>
  );
}
