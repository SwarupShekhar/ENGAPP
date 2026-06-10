import React, { useEffect, useState } from "react";
import {
  Modal,
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Pressable,
  Image,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { chatApi } from "../../../api/connections";
import { engagementApi } from "../../../api/engagement";
import { useAppTheme } from "../../../theme/useAppTheme";

interface ConversationRow {
  conversationId: string;
  partner: { id: string; name: string; profileImage: string | null } | null;
}

export interface SharedChatTarget {
  conversationId: string;
  partnerId: string;
  partnerName: string;
  partnerAvatar?: string;
}

interface Props {
  visible: boolean;
  strapiReelId: number;
  onClose: () => void;
  onShared?: () => void;
  /** Opens the DM thread after a successful share (Instagram-style). */
  onSharedToChat?: (target: SharedChatTarget) => void;
}

export default function ShareReelModal({
  visible,
  strapiReelId,
  onClose,
  onShared,
  onSharedToChat,
}: Props) {
  const theme = useAppTheme();
  const [loading, setLoading] = useState(true);
  const [sharing, setSharing] = useState<string | null>(null);
  const [conversations, setConversations] = useState<ConversationRow[]>([]);

  useEffect(() => {
    if (!visible) return;
    setLoading(true);
    chatApi
      .getConversations()
      .then((data) => setConversations(data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [visible]);

  const handleShare = async (conversationId: string) => {
    const row = conversations.find((c) => c.conversationId === conversationId);
    setSharing(conversationId);
    try {
      await engagementApi.shareReel(strapiReelId, conversationId);
      onShared?.();
      onClose();
      if (row?.partner && onSharedToChat) {
        onSharedToChat({
          conversationId,
          partnerId: row.partner.id,
          partnerName: row.partner.name,
          partnerAvatar: row.partner.profileImage ?? undefined,
        });
      }
    } catch (err) {
      console.error("[ShareReelModal]", err);
    } finally {
      setSharing(null);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable
          style={[styles.sheet, { backgroundColor: theme.colors.surface }]}
          onPress={(e) => e.stopPropagation()}
        >
          <Text style={[styles.title, { color: theme.colors.text.primary }]}>
            Share reel
          </Text>
          {loading ? (
            <ActivityIndicator style={{ marginVertical: 24 }} color={theme.colors.primary} />
          ) : (
            <FlatList
              data={conversations}
              keyExtractor={(item) => item.conversationId}
              style={{ maxHeight: 360 }}
              ListEmptyComponent={
                <Text style={[styles.empty, { color: theme.colors.text.light }]}>
                  Start a chat with a friend to share reels.
                </Text>
              }
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.row}
                  disabled={sharing !== null}
                  onPress={() => handleShare(item.conversationId)}
                >
                  {item.partner?.profileImage ? (
                    <Image
                      source={{ uri: item.partner.profileImage }}
                      style={styles.avatar}
                    />
                  ) : (
                    <View style={[styles.avatar, styles.avatarPlaceholder]}>
                      <Text style={styles.avatarInitial}>
                        {item.partner?.name?.charAt(0)?.toUpperCase() || "?"}
                      </Text>
                    </View>
                  )}
                  <Text
                    style={[styles.name, { color: theme.colors.text.primary }]}
                    numberOfLines={1}
                  >
                    {item.partner?.name || "Unknown"}
                  </Text>
                  {sharing === item.conversationId ? (
                    <ActivityIndicator size="small" color={theme.colors.primary} />
                  ) : (
                    <Ionicons name="send" size={18} color={theme.colors.primary} />
                  )}
                </TouchableOpacity>
              )}
            />
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.4)",
  },
  sheet: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingTop: 16,
    paddingBottom: 28,
    paddingHorizontal: 16,
  },
  title: {
    fontSize: 17,
    fontWeight: "700",
    marginBottom: 12,
    textAlign: "center",
  },
  empty: {
    textAlign: "center",
    paddingVertical: 24,
    fontSize: 14,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    gap: 12,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  avatarPlaceholder: {
    backgroundColor: "#E5E7EB",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarInitial: {
    fontSize: 18,
    fontWeight: "600",
    color: "#6B7280",
  },
  name: {
    flex: 1,
    fontSize: 16,
    fontWeight: "600",
  },
});
