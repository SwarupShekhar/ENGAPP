import React from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useAppTheme } from "../../../theme/useAppTheme";
import { useAuth } from "@clerk/clerk-expo";

export default function AssessmentIntroScreen({ navigation }: any) {
  const theme = useAppTheme();
  const styles = getStyles(theme);
  const { signOut } = useAuth();
  const insets = useSafeAreaInsets();

  const handleSignOut = () => {
    signOut();
  };

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={[
          theme.colors.background,
          theme.colors.gradients.surface[0],
          theme.colors.gradients.surface[1],
          theme.colors.background,
        ]}
        locations={[0, 0.35, 0.65, 1]}
        style={StyleSheet.absoluteFillObject}
      />

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[
          styles.scrollContent,
          {
            paddingTop: insets.top + 16,
            paddingBottom: Math.max(insets.bottom, 20) + 32,
          },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {__DEV__ ? (
          <View style={styles.headerRow}>
            <TouchableOpacity onPress={handleSignOut} style={styles.debugBtn}>
              <Text style={styles.debugBtnText}>Sign out (dev)</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.headerSpacer} />
        )}

        <Animated.View
          entering={FadeInDown.delay(80).springify()}
          style={styles.heroBadge}
        >
          <Text style={styles.heroBadgeText}>~3 min · adapts to you</Text>
        </Animated.View>

        <Animated.View
          entering={FadeInDown.delay(120).springify()}
          style={styles.iconContainer}
        >
          <LinearGradient
            colors={theme.colors.gradients.primary}
            style={styles.iconGradient}
          >
            <Ionicons name="sparkles" size={40} color={theme.colors.surface} />
          </LinearGradient>
        </Animated.View>

        <Animated.View
          entering={FadeInDown.delay(180).springify()}
          style={styles.textCenter}
        >
          <Text style={styles.kicker}>Placement</Text>
          <Text style={styles.title}>English level assessment</Text>
          <Text style={styles.subtitle}>
            Four short tasks so we can tune lessons, difficulty, and speaking
            practice to your level.
          </Text>
        </Animated.View>

        <Animated.View
          entering={FadeInDown.delay(240).springify()}
          style={styles.stepsContainer}
        >
          <StepItem
            step={1}
            icon="book-outline"
            title="Read aloud"
            description="Read a simple sentence clearly."
            delay={300}
          />
          <StepItem
            step={2}
            icon="mic-outline"
            title="Adaptive speaking"
            description="Repeat phrases as they gradually get harder."
            delay={360}
          />
          <StepItem
            step={3}
            icon="image-outline"
            title="Describe an image"
            description="Say what you see in your own words."
            delay={420}
          />
          <StepItem
            step={4}
            icon="chatbubbles-outline"
            title="Open response"
            description="Answer one everyday question."
            delay={480}
          />
        </Animated.View>

        <View style={styles.footer}>
          <TouchableOpacity
            style={styles.buttonContainer}
            onPress={() => navigation.navigate("AssessmentSpeaking")}
            activeOpacity={0.8}
          >
            <LinearGradient
              colors={theme.colors.gradients.primary}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.gradientButton}
            >
              <Text style={styles.buttonText}>Start assessment</Text>
              <Ionicons
                name="arrow-forward"
                size={20}
                color={theme.colors.surface}
              />
            </LinearGradient>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.skipButton}
            onPress={() => navigation.goBack()}
          >
            <Text style={styles.skipText}>Skip for now — you can take it later</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

function StepItem({
  step,
  icon,
  title,
  description,
  delay,
}: {
  step: number;
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  description: string;
  delay: number;
}) {
  const theme = useAppTheme();
  const styles = getStyles(theme);
  return (
    <Animated.View
      entering={FadeInDown.delay(delay).springify()}
      style={styles.stepItem}
    >
      <View style={styles.stepNumberWrap}>
        <Text style={styles.stepNumber}>{step}</Text>
      </View>
      <View style={styles.stepIcon}>
        <Ionicons name={icon} size={22} color={theme.colors.primary} />
      </View>
      <View style={styles.stepTextCol}>
        <Text style={styles.stepTitle}>{title}</Text>
        <Text style={styles.stepDescription}>{description}</Text>
      </View>
    </Animated.View>
  );
}

const getStyles = (theme: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: theme.spacing.l,
    alignItems: "stretch",
    maxWidth: 480,
    width: "100%",
    alignSelf: "center",
  },
  headerRow: {
    width: "100%",
    flexDirection: "row",
    justifyContent: "flex-end",
    marginBottom: theme.spacing.s,
  },
  headerSpacer: {
    height: theme.spacing.s,
  },
  debugBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: theme.colors.error + "18",
    borderWidth: 1,
    borderColor: theme.colors.error + "99",
  },
  debugBtnText: {
    color: theme.colors.error,
    fontSize: 11,
    fontWeight: "600",
  },
  heroBadge: {
    alignSelf: "center",
    paddingHorizontal: theme.spacing.m,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: theme.colors.surface + "CC",
    borderWidth: 1,
    borderColor: theme.colors.primary + "33",
    marginBottom: theme.spacing.m,
  },
  heroBadgeText: {
    fontSize: theme.typography.sizes.xs,
    fontWeight: "600",
    color: theme.colors.text.secondary,
    letterSpacing: 0.3,
  },
  iconContainer: {
    alignSelf: "center",
    marginBottom: theme.spacing.l,
    ...theme.shadows.medium,
  },
  iconGradient: {
    width: 88,
    height: 88,
    borderRadius: 44,
    justifyContent: "center",
    alignItems: "center",
  },
  textCenter: {
    alignItems: "center",
    marginBottom: theme.spacing.l,
  },
  kicker: {
    fontSize: theme.typography.sizes.xs,
    fontWeight: "700",
    color: theme.colors.primary,
    textTransform: "uppercase",
    letterSpacing: 1.2,
    marginBottom: theme.spacing.xs,
  },
  title: {
    fontSize: theme.typography.sizes.xxl,
    fontWeight: "800",
    color: theme.colors.text.primary,
    textAlign: "center",
    marginBottom: theme.spacing.s,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: theme.typography.sizes.m,
    lineHeight: 22,
    color: theme.colors.text.secondary,
    textAlign: "center",
    paddingHorizontal: theme.spacing.s,
  },
  stepsContainer: {
    width: "100%",
    gap: theme.spacing.m,
  },
  stepItem: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: theme.colors.surface + "F2",
    paddingVertical: theme.spacing.m,
    paddingHorizontal: theme.spacing.m,
    borderRadius: theme.borderRadius.l,
    borderWidth: 1,
    borderColor: theme.colors.primary + "14",
    ...theme.shadows.small,
  },
  stepNumberWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: theme.colors.primary + "22",
    alignItems: "center",
    justifyContent: "center",
    marginRight: theme.spacing.s,
  },
  stepNumber: {
    fontSize: 13,
    fontWeight: "800",
    color: theme.colors.primary,
  },
  stepIcon: {
    width: 44,
    height: 44,
    borderRadius: theme.borderRadius.circle,
    backgroundColor: theme.colors.primaryLight + "24",
    justifyContent: "center",
    alignItems: "center",
    marginRight: theme.spacing.m,
  },
  stepTextCol: {
    flex: 1,
    minWidth: 0,
  },
  stepTitle: {
    fontSize: theme.typography.sizes.m,
    fontWeight: "700",
    color: theme.colors.text.primary,
    marginBottom: 4,
  },
  stepDescription: {
    fontSize: theme.typography.sizes.s,
    lineHeight: 18,
    color: theme.colors.text.secondary,
  },
  footer: {
    width: "100%",
    gap: theme.spacing.m,
    marginTop: theme.spacing.xl,
    marginBottom: theme.spacing.m,
  },
  buttonContainer: {
    borderRadius: theme.borderRadius.l,
    overflow: "hidden",
    ...theme.shadows.primaryGlow,
  },
  gradientButton: {
    paddingVertical: theme.spacing.m,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: theme.spacing.s,
  },
  buttonText: {
    color: theme.colors.surface,
    fontSize: theme.typography.sizes.l,
    fontWeight: "bold",
  },
  skipButton: {
    paddingVertical: theme.spacing.s,
    alignItems: "center",
  },
  skipText: {
    color: theme.colors.text.secondary,
    fontSize: theme.typography.sizes.m,
  },
});
