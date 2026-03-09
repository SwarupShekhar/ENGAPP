import React, { useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Share,
  Platform,
} from "react-native";
import ViewShot from "react-native-view-shot";
import { Ionicons } from "@expo/vector-icons";
import { useAppTheme } from "../../theme/useAppTheme";

interface Props {
  startDate: string;
  startLevel: string;
  todayLevel: string;
  pointsGained: number;
}

export default function ShareJourneyCard({
  startDate,
  startLevel,
  todayLevel,
  pointsGained,
}: Props) {
  const theme = useAppTheme();
  const viewShotRef = useRef<ViewShot>(null);

  const handleShare = async () => {
    try {
      if (!viewShotRef.current?.capture) return;
      const uri = await viewShotRef.current.capture();
      if (!uri) return;

      await Share.share({
        message: `I went from ${startLevel} to ${todayLevel} using EngR! 🚀`,
        url: uri,
      });
    } catch (error) {
      console.error("Share failed:", error);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>🎉 Share Your Journey</Text>

      <ViewShot ref={viewShotRef} options={{ format: "jpg", quality: 0.9 }}>
        <View
          style={[
            styles.journeyCard,
            { backgroundColor: theme.colors.primary },
          ]}
        >
          <View style={styles.cardHeader}>
            <Text style={styles.appName}>EngR</Text>
          </View>

          <View style={styles.progression}>
            <View
              style={[
                styles.levelBadge,
                {
                  backgroundColor:
                    theme.tokens.level[
                      (startLevel?.toLowerCase() ||
                        "a1") as keyof typeof theme.tokens.level
                    ] || theme.tokens.level.a1,
                  borderColor: "rgba(255,255,255,0.2)",
                },
              ]}
            >
              <Text style={styles.levelText}>{startLevel}</Text>
            </View>
            <Ionicons
              name="arrow-forward"
              size={32}
              color="white"
              style={styles.arrow}
            />
            <View
              style={[
                styles.levelBadge,
                {
                  backgroundColor:
                    theme.tokens.level[
                      (todayLevel?.toLowerCase() ||
                        "a1") as keyof typeof theme.tokens.level
                    ] || theme.tokens.level.a1,
                  borderColor: "white",
                  borderWidth: 2,
                },
              ]}
            >
              <Text style={styles.levelText}>{todayLevel}</Text>
            </View>
          </View>

          <Text style={styles.stats}>+{pointsGained} points gained</Text>

          <Text style={styles.dates}>
            Started: {new Date(startDate).toLocaleDateString()}
          </Text>
        </View>
      </ViewShot>

      <TouchableOpacity
        style={[styles.shareButton, { backgroundColor: theme.colors.primary }]}
        onPress={handleShare}
      >
        <Ionicons name="share-social" size={18} color="white" />
        <Text style={styles.shareButtonText}>Share Growth</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: 16,
    marginBottom: 16,
    marginHorizontal: 16,
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.1,
        shadowRadius: 10,
      },
      android: {
        elevation: 3,
      },
    }),
  },
  title: {
    fontSize: 16,
    fontWeight: "800",
    color: "#111827",
    marginBottom: 12,
  },
  journeyCard: {
    borderRadius: 16,
    padding: 24,
    alignItems: "center",
    marginBottom: 12,
  },
  cardHeader: {
    marginBottom: 20,
  },
  appName: {
    fontSize: 22,
    fontWeight: "900",
    color: "#FFFFFF",
    letterSpacing: 1,
  },
  progression: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 16,
  },
  levelBadge: {
    backgroundColor: "rgba(255, 255, 255, 0.25)",
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.3)",
  },
  levelBadgeEnd: {
    backgroundColor: "#10B981",
    borderColor: "#10B981",
  },
  levelText: {
    fontSize: 24,
    fontWeight: "800",
    color: "#FFFFFF",
  },
  arrow: {
    marginHorizontal: 12,
  },
  stats: {
    fontSize: 18,
    fontWeight: "700",
    color: "#FFFFFF",
    marginBottom: 6,
  },
  dates: {
    fontSize: 12,
    color: "rgba(255, 255, 255, 0.8)",
    fontWeight: "600",
  },
  shareButton: {
    flexDirection: "row",
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  shareButtonText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#FFFFFF",
  },
});
