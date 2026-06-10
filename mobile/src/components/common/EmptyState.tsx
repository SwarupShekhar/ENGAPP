import React from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ViewStyle,
  StyleProp,
} from "react-native";
import { useAppTheme } from "../../theme/useAppTheme";

interface EmptyStateProps {
  /** Emoji or short glyph shown above the title */
  icon?: string;
  title: string;
  subtitle?: string;
  /** Optional call-to-action button */
  ctaLabel?: string;
  onCtaPress?: () => void;
  /** Tighter layout for inline/card placements (e.g. carousel) */
  compact?: boolean;
  /** Light-on-dark styling for dark surfaces (e.g. eBites feed) */
  dark?: boolean;
  style?: StyleProp<ViewStyle>;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  title,
  subtitle,
  ctaLabel,
  onCtaPress,
  compact = false,
  dark = false,
  style,
}) => {
  const theme = useAppTheme();

  const titleColor = dark ? "#FFFFFF" : theme.colors.text.primary;
  const subtitleColor = dark
    ? "rgba(255,255,255,0.7)"
    : theme.colors.text.secondary;

  return (
    <View
      style={[
        styles.container,
        compact ? styles.containerCompact : null,
        style,
      ]}
      accessibilityRole="text"
      accessibilityLabel={subtitle ? `${title}. ${subtitle}` : title}
    >
      {icon ? (
        <Text style={[styles.icon, compact && styles.iconCompact]}>
          {icon}
        </Text>
      ) : null}
      <Text
        style={[
          styles.title,
          compact && styles.titleCompact,
          { color: titleColor },
        ]}
      >
        {title}
      </Text>
      {subtitle ? (
        <Text style={[styles.subtitle, { color: subtitleColor }]}>
          {subtitle}
        </Text>
      ) : null}
      {ctaLabel && onCtaPress ? (
        <TouchableOpacity
          style={[styles.cta, { backgroundColor: theme.colors.primary }]}
          onPress={onCtaPress}
          accessibilityRole="button"
          accessibilityLabel={ctaLabel}
          activeOpacity={0.8}
        >
          <Text style={styles.ctaText}>{ctaLabel}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 48,
    paddingHorizontal: 32,
  },
  containerCompact: {
    paddingVertical: 16,
    paddingHorizontal: 16,
  },
  icon: {
    fontSize: 44,
    marginBottom: 12,
  },
  iconCompact: {
    fontSize: 30,
    marginBottom: 8,
  },
  title: {
    fontSize: 17,
    fontWeight: "700",
    textAlign: "center",
    marginBottom: 6,
  },
  titleCompact: {
    fontSize: 15,
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center",
    marginBottom: 16,
  },
  cta: {
    paddingHorizontal: 22,
    paddingVertical: 11,
    borderRadius: 22,
  },
  ctaText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "600",
  },
});
