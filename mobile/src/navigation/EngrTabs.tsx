import React from "react";
import { View } from "react-native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import CustomTabBar from "../components/navigation/CustomTabBar";
import FloatingTabBar from "../components/navigation/FloatingTabBar";
import { useUIVariant } from "../context/UIVariantContext";
import HomeScreen from "../features/home/screens";
import FeedbackScreen from "../features/feedback/screens";
import EBitesScreen from "../features/reels/screens/EBitesScreen";
import ProgressScreenIndex from "../features/progress/screens/ProgressScreenIndex";

const Tab = createBottomTabNavigator();

export default function EngrTabs() {
  const { variant } = useUIVariant();

  return (
    <View style={{ flex: 1 }}>
      <Tab.Navigator
        tabBar={(props) =>
          variant === "v2" ? (
            <FloatingTabBar {...props} />
          ) : (
            <CustomTabBar {...props} />
          )
        }
        screenOptions={{ headerShown: false }}
      >
        <Tab.Screen name="Home" component={HomeScreen} />
        <Tab.Screen name="Feedback" component={FeedbackScreen} />
        <Tab.Screen
          name="Call"
          component={View}
          listeners={({ navigation }) => ({
            tabPress: (e) => {
              e.preventDefault();
              navigation.navigate("CallPreference");
            },
          })}
        />
        <Tab.Screen name="eBites" component={EBitesScreen} />
        <Tab.Screen name="Progress" component={ProgressScreenIndex} />
      </Tab.Navigator>
    </View>
  );
}
