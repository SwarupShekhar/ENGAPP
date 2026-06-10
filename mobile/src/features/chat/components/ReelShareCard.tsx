import React from "react";
import { View, Text, Image, StyleSheet, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAppTheme } from "../../../theme/useAppTheme";

export interface ReelShareMetadata {
  strapiReelId: number;
  title: string;
  thumbnailUrl?: string | null;
  difficulty?: string;
  snapshotAt?: string;
}

interface Props {
  metadata: ReelShareMetadata;
  isMine: boolean;
  onPress: () => void;
}

export default function ReelShareCard({ metadata, isMine, onPress }: Props) {
  const theme = useAppTheme();

  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={onPress}
      style={[
        styles.card,
        isMine ? styles.cardMine : styles.cardTheirs,
        { borderColor: theme.colors.border },
      ]}
    >
      <View style={styles.thumbWrap}>
        {metadata.thumbnailUrl ? (
          <Image source={{ uri: metadata.thumbnailUrl }} style={styles.thumb} />
        ) : (
          <View style={[styles.thumb, styles.thumbPlaceholder]}>
            <Ionicons name="play-circle" size={40} color="#FFF" />
          </View>
        )}
        <View style={styles.playBadge}>
          <Ionicons name="play" size={14} color="#FFF" />
        </View>
      </View>
      <View style={styles.meta}>
        <Text style={[styles.label, { color: theme.colors.text.light }]}>
          eBite reel
        </Text>
        <Text
          style={[styles.title, { color: theme.colors.text.primary }]}
          numberOfLines={2}
        >
          {metadata.title}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    width: 220,
    borderRadius: 16,
    overflow: "hidden",
    borderWidth: 1,
    backgroundColor: "#FFF",
  },
  cardMine: {
    alignSelf: "flex-end",
  },
  cardTheirs: {
    alignSelf: "flex-start",
  },
  thumbWrap: {
    position: "relative",
    aspectRatio: 4 / 5,
    backgroundColor: "#111",
  },
  thumb: {
    width: "100%",
    height: "100%",
  },
  thumbPlaceholder: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#374151",
  },
  playBadge: {
    position: "absolute",
    bottom: 8,
    right: 8,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center",
    justifyContent: "center",
  },
  meta: {
    padding: 10,
  },
  label: {
    fontSize: 11,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.4,
    marginBottom: 4,
  },
  title: {
    fontSize: 14,
    fontWeight: "600",
    lineHeight: 18,
  },
});
