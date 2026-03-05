import React from "react";
import { StyleSheet, Text, View, ScrollView, Dimensions } from "react-native";
import { GradientCard } from "../common/GradientCard";
import { useAppTheme } from "../../theme/useAppTheme";
import { MaterialCommunityIcons } from "@expo/vector-icons";

const { width } = Dimensions.get("window");
const CARD_WIDTH = width * 0.7;

interface CarouselItemProps {
  title: string;
  subtitle: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  color: string;
  gradient: readonly [string, string, ...string[]];
}

const CarouselItem: React.FC<CarouselItemProps> = ({
  title,
  subtitle,
  icon,
  color,
  gradient,
}) => {
  const theme = useAppTheme();
  const styles = getStyles(theme);
  return (
    <GradientCard style={styles.card} colors={gradient}>
      <View style={styles.cardHeader}>
        <View
          style={[
            styles.iconContainer,
            { backgroundColor: "rgba(255,255,255,0.2)" },
          ]}
        >
          <MaterialCommunityIcons
            name={icon}
            size={24}
            color={theme.colors.surface}
          />
        </View>
      </View>
      <View style={styles.cardContent}>
        <Text style={styles.cardTitle}>{title}</Text>
        <Text style={styles.cardSubtitle}>{subtitle}</Text>
      </View>
    </GradientCard>
  );
};

export const HomeCarousel: React.FC = () => {
  const theme = useAppTheme();
  const styles = getStyles(theme);
  return (
    <View style={styles.container}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        decelerationRate="fast"
        snapToInterval={CARD_WIDTH + theme.spacing.m}
      >
        <CarouselItem
          title="7 Day Streak"
          subtitle="You're on fire! Keep it up."
          icon="fire"
          color={theme.colors.warning}
          gradient={[theme.colors.warning, theme.colors.warning + "dd"]}
        />
        <CarouselItem
          title="Daily Insight"
          subtitle="Did you know? Consistency is key."
          icon="lightbulb-on-outline"
          color={theme.colors.primary}
          gradient={theme.colors.gradients.primary}
        />
        <CarouselItem
          title="Great Accuracy"
          subtitle="Your grammar is top 10%!"
          icon="check-decagram"
          color={theme.colors.success}
          gradient={[theme.colors.success, theme.colors.success + "dd"]}
        />
      </ScrollView>
    </View>
  );
};

const getStyles = (theme: any) =>
  StyleSheet.create({
    container: {
      marginVertical: theme.spacing.m,
    },
    scrollContent: {
      paddingHorizontal: theme.spacing.m,
      gap: theme.spacing.m,
      paddingBottom: theme.spacing.m, // space for shadow
    },
    card: {
      width: CARD_WIDTH,
      height: 160,
      justifyContent: "space-between",
      ...theme.shadows.medium,
    },
    cardHeader: {
      alignItems: "flex-start",
    },
    iconContainer: {
      padding: theme.spacing.s,
      borderRadius: theme.borderRadius.m,
    },
    cardContent: {},
    cardTitle: {
      fontSize: theme.typography.sizes.l,
      fontWeight: theme.typography.weights.bold as any,
      color: theme.colors.surface,
      marginBottom: theme.spacing.xs,
    },
    cardSubtitle: {
      fontSize: theme.typography.sizes.s,
      color: theme.colors.surface,
      opacity: 0.9,
    },
  });
