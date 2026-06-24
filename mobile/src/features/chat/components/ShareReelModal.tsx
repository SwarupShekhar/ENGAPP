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
  Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { chatApi, connectionsApi } from "../../../api/connections";
import { engagementApi } from "../../../api/engagement";
import { userApi } from "../../../api/user";
import { useAppTheme } from "../../../theme/useAppTheme";

interface ShareTargetRow {
  key: string;
  conversationId?: string;
  partner: { id: string; name: string; profileImage: string | null };
}

export interface SharedChatTarget {
  conversationId: string;
  partnerId: string;
  partnerName: string;
  partnerAvatar?: string;
}

export interface ReelShareSnapshot {
  title: string;
  thumbnailUrl?: string | null;
  muxPlaybackId?: string;
}

interface Props {
  visible: boolean;
  strapiReelId: number;
  reelSnapshot?: ReelShareSnapshot;
  onClose: () => void;
  onShared?: () => void;
  /** Opens the DM thread after a successful share (Instagram-style). */
  onSharedToChat?: (target: SharedChatTarget) => void;
}

export default function ShareReelModal({
  visible,
  strapiReelId,
  reelSnapshot,
  onClose,
  onShared,
  onSharedToChat,
}: Props) {
  const theme = useAppTheme();
  const [loading, setLoading] = useState(true);
  const [sharing, setSharing] = useState<string | null>(null);
  const [targets, setTargets] = useState<ShareTargetRow[]>([]);

  useEffect(() => {
    if (!visible) return;
    setLoading(true);
    (async () => {
      try {
        const [conversations, friends, myUserId] = await Promise.all([
          chatApi.getConversations(),
          connectionsApi.getFriends(),
          userApi.getCurrentUserId(),
        ]);

        const byPartnerId = new Map<string, ShareTargetRow>();

        for (const conv of conversations ?? []) {
          if (!conv?.partner?.id) continue;
          byPartnerId.set(conv.partner.id, {
            key: conv.conversationId,
            conversationId: conv.conversationId,
            partner: {
              id: conv.partner.id,
              name: conv.partner.name || "Friend",
              profileImage: conv.partner.profileImage ?? null,
            },
          });
        }

        for (const friendship of friends ?? []) {
          const partner =
            friendship.requesterId === myUserId
              ? friendship.addressee
              : friendship.addresseeId === myUserId
                ? friendship.requester
                : null;
          if (!partner?.id || byPartnerId.has(partner.id)) continue;
          const name =
            `${partner.fname ?? ""} ${partner.lname ?? ""}`.trim() || "Friend";
          byPartnerId.set(partner.id, {
            key: `friend-${partner.id}`,
            partner: {
              id: partner.id,
              name,
              profileImage: partner.profile?.avatarUrl ?? null,
            },
          });
        }

        setTargets(
          [...byPartnerId.values()].sort((a, b) =>
            a.partner.name.localeCompare(b.partner.name),
          ),
        );
      } catch (err) {
        console.error("[ShareReelModal] load targets failed:", err);
        setTargets([]);
      } finally {
        setLoading(false);
      }
    })();
  }, [visible]);

  const handleShare = async (row: ShareTargetRow) => {
    setSharing(row.key);
    try {
      let conversationId = row.conversationId;
      if (!conversationId) {
        const created = await chatApi.findOrCreate(row.partner.id);
        conversationId = created.conversationId;
      }
      if (!conversationId) {
        throw new Error("No conversationId");
      }

      await engagementApi.shareReel(
        strapiReelId,
        conversationId,
        reelSnapshot,
      );
      onShared?.();
      onClose();
      if (onSharedToChat) {
        onSharedToChat({
          conversationId,
          partnerId: row.partner.id,
          partnerName: row.partner.name,
          partnerAvatar: row.partner.profileImage ?? undefined,
        });
      }
    } catch (err: any) {
      console.error("[ShareReelModal]", err);
      const apiMsg =
        err?.response?.data?.message ||
        (Array.isArray(err?.response?.data?.message)
          ? err.response.data.message.join(", ")
          : null);
      Alert.alert(
        "Could not share reel",
        apiMsg ||
          "Check your connection and try again. If this keeps happening, refresh eBites.",
      );
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
              data={targets}
              keyExtractor={(item) => item.key}
              style={{ maxHeight: 360 }}
              ListEmptyComponent={
                <Text style={[styles.empty, { color: theme.colors.text.light }]}>
                  Add a friend first — then you can share reels in chat.
                </Text>
              }
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.row}
                  disabled={sharing !== null}
                  onPress={() => handleShare(item)}
                >
                  {item.partner.profileImage ? (
                    <Image
                      source={{ uri: item.partner.profileImage }}
                      style={styles.avatar}
                    />
                  ) : (
                    <View style={[styles.avatar, styles.avatarPlaceholder]}>
                      <Text style={styles.avatarInitial}>
                        {item.partner.name.charAt(0).toUpperCase() || "?"}
                      </Text>
                    </View>
                  )}
                  <Text
                    style={[styles.name, { color: theme.colors.text.primary }]}
                    numberOfLines={1}
                  >
                    {item.partner.name}
                  </Text>
                  {sharing === item.key ? (
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
