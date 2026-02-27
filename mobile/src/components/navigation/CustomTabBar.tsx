import React from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  Platform,
} from "react-native";
import { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { theme } from "../../theme/theme";
import Animated, {
  useAnimatedStyle,
  withSpring,
  useSharedValue,
} from "react-native-reanimated";

const { width } = Dimensions.get("window");

export default function CustomTabBar({
  state,
  descriptors,
  navigation,
}: BottomTabBarProps) {
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[
        styles.container,
        {
          paddingBottom: Math.max(
            insets.bottom,
            Platform.OS === "ios" ? 20 : 10,
          ),
        },
      ]}
    >
      <View style={styles.tabBar}>
        {state.routes.map((route, index) => {
          const { options } = descriptors[route.key];
          const isFocused = state.index === index;

          const onPress = () => {
            const event = navigation.emit({
              type: "tabPress",
              target: route.key,
              canPreventDefault: true,
            });

            if (!isFocused && !event.defaultPrevented) {
              navigation.navigate(route.name);
            }
          };

          // Special handling for Call button
          if (route.name === "Call") {
            return (
              <View key={index} style={styles.centerButtonContainer}>
                <TouchableOpacity
                  activeOpacity={0.9}
                  onPress={() => navigation.navigate("CallPreference")}
                  style={styles.centerButton}
                >
                  <LinearGradient
                    colors={theme.colors.gradients.primary}
                    style={styles.gradientCircle}
                  >
                    <Ionicons name="call" size={32} color="white" />
                  </LinearGradient>
                </TouchableOpacity>
              </View>
            );
          }

          let iconName: any = "home";
          if (route.name === "Home")
            iconName = isFocused ? "home" : "home-outline";
          if (route.name === "Feedback")
            iconName = isFocused ? "document-text" : "document-text-outline";
          if (route.name === "eBites")
            iconName = isFocused ? "videocam" : "videocam-outline";
          if (route.name === "Progress")
            iconName = isFocused ? "person" : "person-outline";

          return (
            <TouchableOpacity
              key={index}
              accessibilityRole="button"
              accessibilityState={isFocused ? { selected: true } : {}}
              accessibilityLabel={options.tabBarAccessibilityLabel}
              testID={(options as any).tabBarTestID}
              onPress={onPress}
              style={styles.tabItem}
            >
              <Ionicons
                name={iconName}
                size={24}
                color={
                  isFocused ? theme.colors.primary : theme.colors.text.secondary
                }
              />
              <Text
                style={[
                  styles.label,
                  {
                    color: isFocused
                      ? theme.colors.primary
                      : theme.colors.text.secondary,
                  },
                ]}
              >
                {route.name}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: "center",
  },
  tabBar: {
    flexDirection: "row",
    backgroundColor: "white",
    width: width * 0.92,
    height: 70,
    borderRadius: 35,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.1,
    shadowRadius: 20,
    elevation: 10,
    justifyContent: "space-between",
    paddingHorizontal: 5,
    alignItems: "center",
  },
  tabItem: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    height: "100%",
  },
  label: {
    fontSize: 10,
    fontWeight: "600",
    marginTop: 4,
  },
  centerButtonContainer: {
    width: 70,
    height: 70,
    marginTop: -30, // Adjusted pull up
    justifyContent: "center",
    alignItems: "center",
    zIndex: 10,
  },
  centerButton: {
    width: 64,
    height: 64,
    borderRadius: 32,
    shadowColor: "#7C3AED", // Violet shadow
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 16,
    elevation: 10,
    backgroundColor: "white", // Ensure button has bg behind gradient if needed
    marginBottom: 10,
  },
  gradientCircle: {
    width: "100%",
    height: "100%",
    borderRadius: 32,
    justifyContent: "center",
    alignItems: "center",
  },
});
