import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { useAppTheme } from "../../theme/useAppTheme";
import { BlurView } from "expo-blur";

export interface ContextualCard {
  id: string;
  type: "achievement" | "tip" | "news" | "reminder";
  title: string;
  description: string;
  icon: string;
  actionLabel?: string;
  onPress?: () => void;
}

interface Props {
  cards: ContextualCard[];
}

export default function ContextualCardList({ cards }: Props) {
  const { theme } = useAppTheme();

  if (!cards || cards.length === 0) return null;

  return (
    <View style={styles.container}>
      {cards.map((card) => (
        <TouchableOpacity
          key={card.id}
          style={[
            styles.card,
            {
              backgroundColor: theme.colors.surface,
              ...theme.shadows.sm,
            },
          ]}
          activeOpacity={0.8}
          onPress={card.onPress}
        >
          <View style={styles.iconContainer}>
            <Text style={styles.icon}>{card.icon}</Text>
          </View>
          <View style={styles.content}>
            <Text style={[styles.title, { color: theme.colors.text.primary }]}>
              {card.title}
            </Text>
            <Text
              style={[
                styles.description,
                { color: theme.colors.text.secondary },
              ]}
              numberOfLines={2}
            >
              {card.description}
            </Text>
            {card.actionLabel && (
              <Text
                style={[styles.action, { color: theme.gradients.premium[0] }]}
              >
                {card.actionLabel} →
              </Text>
            )}
          </View>
        </TouchableOpacity>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 20,
    gap: 12,
  },
  card: {
    flexDirection: "row",
    borderRadius: 16,
    padding: 16,
    alignItems: "center",
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#F3F4F6", // Neutral background for icon
    justifyContent: "center",
    alignItems: "center",
    marginRight: 16,
  },
  icon: {
    fontSize: 24,
  },
  content: {
    flex: 1,
  },
  title: {
    fontSize: 16,
    fontWeight: "700",
    marginBottom: 4,
  },
  description: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 8,
  },
  action: {
    fontSize: 14,
    fontWeight: "600",
  },
});
