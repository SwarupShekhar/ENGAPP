import React from "react";
import { View, Text, StyleSheet } from "react-native";
import type { RunItem } from "../logic/groupChatListItems";
import type { AggregatedReaction } from "../../../api/engagement";
import ReelShareCard, { ReelShareMetadata } from "./ReelShareCard";
import TextBubble from "./TextBubble";
import ClusterFooter from "./ClusterFooter";
import { chatThreadTheme } from "../theme/chatTheme";

interface Props {
  run: RunItem;
  messageReactions: Record<string, AggregatedReaction[]>;
  onLongPressMessage: (msg: any) => void;
  onOpenReel: (metadata: ReelShareMetadata) => void;
  primaryColor: string;
}

export default function MessageRunRow({
  run,
  messageReactions,
  onLongPressMessage,
  onOpenReel,
  primaryColor,
}: Props) {
  const { isMine, messages, clusterTime, showReadReceipt } = run;

  // Count only text bubbles for stacking radii (reels are full-width cards)
  const textCount = messages.filter(
    (m) => !(m.type === "reel_share" && m.metadata?.strapiReelId)
  ).length;
  let textIndex = 0;

  return (
    <View style={[styles.runContainer, isMine ? styles.runRight : styles.runLeft]}>
      {messages.map((msg, i) => {
        const reactions = messageReactions[msg.id] || [];
        const isLastMsg = i === messages.length - 1;

        if (msg.type === "reel_share" && msg.metadata?.strapiReelId) {
          return (
            <View key={msg.id} style={isLastMsg ? undefined : styles.bubbleGap}>
              <ReelShareCard
                metadata={msg.metadata as ReelShareMetadata}
                isMine={isMine}
                onPress={() => onOpenReel(msg.metadata as ReelShareMetadata)}
              />
              {reactions.length > 0 && (
                <View style={[styles.reactionsRow, isMine ? styles.reactionsRight : styles.reactionsLeft]}>
                  {reactions.map((r: AggregatedReaction) => (
                    <Text key={r.emoji} style={styles.reactionChip}>
                      {r.emoji}{r.count > 1 ? ` ${r.count}` : ""}
                    </Text>
                  ))}
                </View>
              )}
            </View>
          );
        }

        const idx = textIndex++;

        return (
          <View key={msg.id} style={isLastMsg ? undefined : styles.bubbleGap}>
            <TextBubble
              content={msg.content}
              isMine={isMine}
              index={idx}
              count={textCount}
              onLongPress={() => onLongPressMessage(msg)}
            />
            {reactions.length > 0 && (
              <View style={[styles.reactionsRow, isMine ? styles.reactionsRight : styles.reactionsLeft]}>
                {reactions.map((r: AggregatedReaction) => (
                  <Text key={r.emoji} style={styles.reactionChip}>
                    {r.emoji}{r.count > 1 ? ` ${r.count}` : ""}
                  </Text>
                ))}
              </View>
            )}
          </View>
        );
      })}

      <ClusterFooter
        clusterTime={clusterTime}
        isMine={isMine}
        showReadReceipt={showReadReceipt}
        primaryColor={primaryColor}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  runContainer: {
    maxWidth: chatThreadTheme.maxBubbleWidth as any,
    marginBottom: chatThreadTheme.runToRunGap,
  },
  runRight: {
    alignSelf: "flex-end",
    alignItems: "flex-end",
  },
  runLeft: {
    alignSelf: "flex-start",
    alignItems: "flex-start",
  },
  bubbleGap: {
    marginBottom: chatThreadTheme.runGap,
  },
  reactionsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 4,
    marginTop: 3,
    marginBottom: 2,
  },
  reactionsRight: {
    justifyContent: "flex-end",
  },
  reactionsLeft: {
    justifyContent: "flex-start",
  },
  reactionChip: {
    fontSize: 13,
    backgroundColor: chatThreadTheme.dateSeparatorBg,
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 2,
    overflow: "hidden",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.12)",
    color: "#FFF",
  },
});
