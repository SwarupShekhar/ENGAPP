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
import { useAppTheme } from "../../theme/useAppTheme";
import { BlurView } from "expo-blur";

const { width } = Dimensions.get("window");
const BAR_WIDTH = width * 0.94;
const BAR_HEIGHT = 72;
const BAR_RADIUS = BAR_HEIGHT / 2;

export default function CustomTabBar({
  state,
  descriptors,
  navigation,
}: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const theme = useAppTheme();
  // Detect light vs dark by checking actual background luminance
  const bg = theme.colors.background;
  const isDark = bg.startsWith("#")
    ? parseInt(bg.slice(1, 3), 16) * 0.299 +
        parseInt(bg.slice(3, 5), 16) * 0.587 +
        parseInt(bg.slice(5, 7), 16) * 0.114 <
      128
    : false;

  const activeColor = isDark ? "#FFFFFF" : theme.colors.primary;
  const inactiveColor = isDark
    ? "rgba(255,255,255,0.55)"
    : theme.colors.text.secondary;

  return (
    <View
      style={[
        styles.outerContainer,
        {
          paddingBottom: Math.max(
            insets.bottom,
            Platform.OS === "ios" ? 20 : 12,
          ),
        },
      ]}
    >
      {/* ── Floating center call button (rendered FIRST, sits above pill) ── */}
      <View
        style={[
          styles.centerButtonAnchor,
          {
            bottom:
              Math.max(insets.bottom, Platform.OS === "ios" ? 20 : 12) +
              BAR_HEIGHT / 2 -
              8,
          },
        ]}
      >
        <TouchableOpacity
          activeOpacity={0.9}
          onPress={() => navigation.navigate("CallPreference")}
          style={[styles.centerButton, { shadowColor: theme.colors.primary }]}
        >
          <LinearGradient
            colors={theme.colors.gradients.primary}
            style={styles.gradientCircle}
          >
            <Ionicons name="call" size={28} color="white" />
          </LinearGradient>
        </TouchableOpacity>
      </View>

      {/* ── The glass pill ── */}
      <View style={styles.pillShadow}>
        <View style={styles.pillClip}>
          {/* Layer 1: Native frosted blur */}
          <BlurView
            intensity={100}
            tint={isDark ? "dark" : "light"}
            experimentalBlurMethod="dimezisBlurView"
            blurReductionFactor={4}
            style={StyleSheet.absoluteFill}
          />

          {/* Layer 2: Tint overlay for saturation */}
          <View
            style={[
              StyleSheet.absoluteFill,
              {
                backgroundColor: isDark
                  ? "rgba(20, 20, 50, 0.4)"
                  : "rgba(255, 255, 255, 0.65)",
              },
            ]}
          />

          {/* Layer 4: Glass edge highlight border */}
          <View
            style={[
              StyleSheet.absoluteFill,
              styles.glassEdge,
              {
                borderColor: isDark
                  ? "rgba(255, 255, 255, 0.15)"
                  : "rgba(255, 255, 255, 0.6)",
              },
            ]}
          />

          {/* Tab items */}
          <View style={styles.tabRow}>
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

              // Reserve space for the center call button
              if (route.name === "Call") {
                return <View key={index} style={styles.centerSpacer} />;
              }

              let iconName: any = "home";
              if (route.name === "Home")
                iconName = isFocused ? "home" : "home-outline";
              if (route.name === "Feedback")
                iconName = isFocused
                  ? "document-text"
                  : "document-text-outline";
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
                    size={22}
                    color={isFocused ? activeColor : inactiveColor}
                  />
                  <Text
                    style={[
                      styles.label,
                      { color: isFocused ? activeColor : inactiveColor },
                    ]}
                  >
                    {route.name}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  outerContainer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: "center",
  },

  /* Shadow wrapper — shadows can't render on overflow:hidden views */
  pillShadow: {
    width: BAR_WIDTH,
    height: BAR_HEIGHT,
    borderRadius: BAR_RADIUS,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 24,
    elevation: 12,
  },

  /* Clip wrapper — gives the perfect pill + clips the blur layers */
  pillClip: {
    width: "100%",
    height: "100%",
    borderRadius: BAR_RADIUS,
    overflow: "hidden",
  },

  /* Glass edge border overlay */
  glassEdge: {
    borderRadius: BAR_RADIUS,
    borderWidth: 1,
  },

  /* Row of tabs */
  tabRow: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 8,
  },

  tabItem: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    height: "100%",
  },

  label: {
    fontSize: 10,
    fontWeight: "700",
    marginTop: 3,
  },

  centerSpacer: {
    width: 68,
  },

  /* Floating call button — positioned absolutely from outerContainer */
  centerButtonAnchor: {
    position: "absolute",
    alignSelf: "center",
    zIndex: 20,
  },

  centerButton: {
    width: 62,
    height: 62,
    borderRadius: 31,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.45,
    shadowRadius: 14,
    elevation: 10,
  },

  gradientCircle: {
    width: "100%",
    height: "100%",
    borderRadius: 31,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.25)",
  },
});
