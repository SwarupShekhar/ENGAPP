import React from "react";
import { View, Text, Image, StyleSheet, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { chatThreadTheme } from "../theme/chatTheme";

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
  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={onPress}
      style={[
        styles.card,
        isMine ? styles.cardMine : styles.cardTheirs,
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
        <Text style={styles.label}>eBite reel</Text>
        <Text style={styles.title} numberOfLines={2}>
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
    borderWidth: StyleSheet.hairlineWidth,
    backgroundColor: chatThreadTheme.incomingBubble,
    borderColor: "rgba(255,255,255,0.12)",
  },
  cardMine: {
    alignSelf: "flex-end",
    borderColor: "rgba(109,40,217,0.45)",
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
    color: chatThreadTheme.footerMuted,
  },
  title: {
    fontSize: 14,
    fontWeight: "600",
    lineHeight: 18,
    color: chatThreadTheme.incomingText,
  },
});
