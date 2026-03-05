import React, { useEffect } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withRepeat,
  withSequence,
  FadeInDown,
} from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import { BlurView } from "expo-blur";
import { useAppTheme } from "../../theme/useAppTheme";

interface Props {
  title: string;
  description: string;
  buttonText: string;
  onPress: () => void;
  showMayaChip?: boolean;
  onMayaPress?: () => void;
}

export default function PremiumCTACard({
  title,
  description,
  buttonText,
  onPress,
  showMayaChip = true,
  onMayaPress,
}: Props) {
  const { theme } = useAppTheme();
  const pulseScale = useSharedValue(1);

  useEffect(() => {
    // Subtle pulse animation for the button
    pulseScale.value = withRepeat(
      withSequence(
        withSpring(1.02, { damping: 10, stiffness: 100 }),
        withSpring(1, { damping: 10, stiffness: 100 }),
      ),
      -1,
      false,
    );
  }, []);

  const buttonAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulseScale.value }],
  }));

  return (
    <Animated.View
      entering={FadeInDown.delay(200).springify()}
      style={[
        styles.container,
        {
          backgroundColor: theme.colors.surface,
          ...theme.shadows.md,
        },
      ]}
    >
      {/* Accent bar on left - using success color as per guide or theme primary */}
      <View
        style={[styles.accentBar, { backgroundColor: theme.colors.success }]}
      />

      <View style={styles.content}>
        {/* Title Section */}
        <View style={styles.headerSection}>
          <Text style={[styles.title, { color: theme.colors.text.primary }]}>
            {title}
          </Text>
          {description && (
            <Text
              style={[
                styles.description,
                { color: theme.colors.text.secondary },
              ]}
            >
              {description}
            </Text>
          )}
        </View>

        {/* Primary Action */}
        <Animated.View style={buttonAnimatedStyle}>
          <TouchableOpacity
            style={[
              styles.primaryButton,
              { ...theme.shadows.lg, shadowColor: theme.gradients.premium[0] },
            ]}
            onPress={onPress}
            activeOpacity={0.9}
          >
            <LinearGradient
              colors={theme.gradients.premium as any}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.buttonGradient}
            >
              <Text style={styles.buttonText}>{buttonText}</Text>
              <Text style={styles.buttonArrow}>→</Text>
            </LinearGradient>
          </TouchableOpacity>
        </Animated.View>

        {/* Maya Chip */}
        {showMayaChip && (
          <TouchableOpacity
            style={styles.mayaChip}
            onPress={onMayaPress}
            activeOpacity={0.8}
          >
            <BlurView
              intensity={40}
              tint={theme.variation === "deep" ? "dark" : "light"}
              style={[
                styles.mayaChipBlur,
                { borderColor: theme.colors.border },
              ]}
            >
              <Text style={styles.mayaIcon}>✨</Text>
              <Text
                style={[styles.mayaText, { color: theme.gradients.premium[0] }]}
              >
                Ask Maya
              </Text>
            </BlurView>
          </TouchableOpacity>
        )}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 20,
    marginHorizontal: 20,
    marginBottom: 16,
    overflow: "hidden",
  },
  accentBar: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
  },
  content: {
    padding: 20,
    paddingLeft: 24,
  },
  headerSection: {
    marginBottom: 16,
  },
  title: {
    fontSize: 22,
    fontWeight: "700",
    letterSpacing: -0.5,
    marginBottom: 6,
  },
  description: {
    fontSize: 15,
    fontWeight: "400",
    lineHeight: 22,
  },
  primaryButton: {
    borderRadius: 14,
    overflow: "hidden",
  },
  buttonGradient: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 16,
    paddingHorizontal: 24,
  },
  buttonText: {
    fontSize: 17,
    fontWeight: "600",
    color: "#FFFFFF",
    letterSpacing: -0.2,
    marginRight: 8,
  },
  buttonArrow: {
    fontSize: 20,
    color: "#FFFFFF",
    fontWeight: "600",
  },
  mayaChip: {
    marginTop: 12,
    borderRadius: 12,
    overflow: "hidden",
    alignSelf: "flex-start",
  },
  mayaChipBlur: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderWidth: 1,
  },
  mayaIcon: {
    fontSize: 16,
    marginRight: 6,
  },
  mayaText: {
    fontSize: 14,
    fontWeight: "600",
    letterSpacing: -0.2,
  },
});
