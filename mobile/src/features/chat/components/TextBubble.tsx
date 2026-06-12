import React from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { chatThreadTheme, getBubbleRadii } from "../theme/chatTheme";

type TextBubbleProps = {
  content: string;
  isMine: boolean;
  index: number;
  count: number;
  onLongPress: () => void;
};

export default function TextBubble({ content, isMine, index, count, onLongPress }: TextBubbleProps) {
  const radii = getBubbleRadii(index, count, isMine);
  return (
    <Pressable onLongPress={onLongPress}>
      <View style={[styles.bubble, isMine ? styles.mine : styles.theirs, radii]}>
        <Text style={[styles.text, isMine ? styles.mineText : styles.theirsText]}>
          {content}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bubble: {
    paddingHorizontal: chatThreadTheme.bubblePaddingH,
    paddingVertical: chatThreadTheme.bubblePaddingV,
    borderRadius: 18,
  },
  mine: {
    backgroundColor: chatThreadTheme.outgoingBubble,
  },
  theirs: {
    backgroundColor: chatThreadTheme.incomingBubble,
  },
  text: {
    fontSize: 15,
    lineHeight: 21,
  },
  mineText: {
    color: chatThreadTheme.outgoingText,
  },
  theirsText: {
    color: chatThreadTheme.incomingText,
  },
});
