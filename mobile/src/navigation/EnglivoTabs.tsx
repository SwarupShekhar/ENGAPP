import React from "react";
import { View } from "react-native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import FloatingTabBar from "../components/navigation/FloatingTabBar";
import EnglivoHomeScreen from "../features/englivo/screens/EnglivoHomeScreenV2";
import EnglivoSessionsScreen from "../features/englivo/screens/EnglivoSessionsScreen";
import EnglivoProgressScreen from "../features/englivo/screens/EnglivoProgressScreen";
import EnglivoProfileScreen from "../features/englivo/screens/EnglivoProfileScreen";

const Tab = createBottomTabNavigator();

export default function EnglivoTabs() {
  return (
    <View style={{ flex: 1 }}>
      <Tab.Navigator
        tabBar={(props) => <FloatingTabBar {...props} englivo />}
        screenOptions={{ headerShown: false }}
      >
        <Tab.Screen name="Home" component={EnglivoHomeScreen} />
        <Tab.Screen name="Sessions" component={EnglivoSessionsScreen} />
        <Tab.Screen name="Progress" component={EnglivoProgressScreen} />
        <Tab.Screen name="Profile" component={EnglivoProfileScreen} />
      </Tab.Navigator>
    </View>
  );
}
