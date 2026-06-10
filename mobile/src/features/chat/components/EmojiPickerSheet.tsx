import React from "react";
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Pressable,
} from "react-native";
import { useAppTheme } from "../../../theme/useAppTheme";

const EMOJI_ROWS = [
  "😀",
  "😂",
  "🥰",
  "😍",
  "😊",
  "😉",
  "😭",
  "😡",
  "👍",
  "👏",
  "🙏",
  "🔥",
  "❤️",
  "💯",
  "✨",
  "🎉",
  "👋",
  "🤔",
  "😮",
  "😢",
  "🙌",
  "💪",
  "📚",
  "🗣️",
];

interface Props {
  visible: boolean;
  onClose: () => void;
  onSelect: (emoji: string) => void;
}

export default function EmojiPickerSheet({ visible, onClose, onSelect }: Props) {
  const theme = useAppTheme();

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable
          style={[styles.sheet, { backgroundColor: theme.colors.surface }]}
          onPress={(e) => e.stopPropagation()}
        >
          <View style={styles.handle} />
          <Text style={[styles.title, { color: theme.colors.text.primary }]}>
            Emoji
          </Text>
          <ScrollView contentContainerStyle={styles.grid}>
            {EMOJI_ROWS.map((emoji) => (
              <TouchableOpacity
                key={emoji}
                style={styles.emojiCell}
                onPress={() => {
                  onSelect(emoji);
                  onClose();
                }}
              >
                <Text style={styles.emoji}>{emoji}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.35)",
  },
  sheet: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingBottom: 24,
    maxHeight: "45%",
  },
  handle: {
    alignSelf: "center",
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#D1D5DB",
    marginTop: 8,
    marginBottom: 8,
  },
  title: {
    fontSize: 16,
    fontWeight: "600",
    textAlign: "center",
    marginBottom: 8,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: 12,
  },
  emojiCell: {
    width: "12.5%",
    aspectRatio: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  emoji: {
    fontSize: 28,
  },
});
