import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { chatThreadTheme } from "../theme/chatTheme";

type ClusterFooterProps = {
  clusterTime: string;
  isMine: boolean;
  showReadReceipt: boolean;
  primaryColor?: string;
};

export default function ClusterFooter({ clusterTime, isMine, showReadReceipt, primaryColor }: ClusterFooterProps) {
  const timeStr = new Date(clusterTime).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
  return (
    <View style={[styles.row, isMine ? styles.right : styles.left]}>
      <Text style={styles.time}>{timeStr}</Text>
      {isMine && showReadReceipt && (
        <Ionicons
          name="checkmark-done"
          size={14}
          color={primaryColor ?? chatThreadTheme.outgoingBubble}
          style={styles.icon}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 3,
    gap: 3,
  },
  right: {
    justifyContent: "flex-end",
  },
  left: {
    justifyContent: "flex-start",
  },
  time: {
    fontSize: 11,
    color: chatThreadTheme.footerMuted,
  },
  icon: {
    marginLeft: 2,
  },
});
