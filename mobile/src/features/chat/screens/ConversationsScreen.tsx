import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Image,
  RefreshControl,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useNavigation, useFocusEffect } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { chatApi } from "../../../api/connections";
import SocketService from "../../call/services/socketService";
import { useAppTheme } from "../../../theme/useAppTheme";

interface Conversation {
  conversationId: string;
  partner: {
    id: string;
    name: string;
    profileImage: string | null;
    level: string;
  } | null;
  lastMessage: {
    content: string;
    type: string;
    senderName: string;
    senderId: string;
    createdAt: string;
  } | null;
  lastActivityAt: string;
  isOnline?: boolean;
  unreadCount: number;
}

export default function ConversationsScreen() {
  const theme = useAppTheme();
  const styles = getStyles(theme);
  const navigation = useNavigation();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [onlineUsers, setOnlineUsers] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const socketService = SocketService.getInstance();

  const fetchConversations = async () => {
    try {
      const data: Conversation[] = await chatApi.getConversations();

      // Ensure uniqueness just in case
      const unique = data.filter(
        (conv, index, self) =>
          index ===
          self.findIndex((c) => c.conversationId === conv.conversationId),
      );

      setConversations(unique);
    } catch (error) {
      console.error("[ConversationsScreen] Fetch error:", error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      fetchConversations();

      // Presence listener
      const handlePresence = (data: { userId: string; status: string }) => {
        setOnlineUsers((prev) => {
          const next = new Set(prev);
          if (data.status === "online") next.add(data.userId);
          else next.delete(data.userId);
          return next;
        });
      };

      socketService.onPresenceUpdate(handlePresence);

      // New message listener for real-time list updates
      const handleNewMessage = (data: any) => {
        console.log(
          "[ConversationsScreen] Real-time message received, re-fetching list",
        );
        fetchConversations();
      };
      socketService.onNewMessage(handleNewMessage);

      // Fetch initial presence
      socketService.getOnlineUsers((data) => {
        setOnlineUsers(new Set(data.onlineUserIds));
      });

      return () => {
        socketService.offPresenceUpdate(handlePresence);
        socketService.offNewMessage(handleNewMessage);
      };
    }, []),
  );

  const onRefresh = () => {
    setRefreshing(true);
    fetchConversations();
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (days === 0) {
      return date.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      });
    } else if (days === 1) {
      return "Yesterday";
    } else if (days < 7) {
      return date.toLocaleDateString([], { weekday: "short" });
    } else {
      return date.toLocaleDateString([], { month: "short", day: "numeric" });
    }
  };

  const renderItem = ({ item }: { item: Conversation }) => (
    <TouchableOpacity
      style={styles.conversationItem}
      onPress={() =>
        (navigation as any).navigate("Chat", {
          conversationId: item.conversationId,
          partnerId: item.partner?.id,
          partnerName: item.partner?.name,
          partnerAvatar: item.partner?.profileImage,
        })
      }
    >
      <View style={styles.avatarContainer}>
        {item.partner?.profileImage ? (
          <Image
            source={{ uri: item.partner.profileImage }}
            style={styles.avatar}
          />
        ) : (
          <View style={styles.avatarPlaceholder}>
            <Text style={styles.avatarInitial}>
              {item.partner?.name.charAt(0).toUpperCase() || "?"}
            </Text>
          </View>
        )}
        {onlineUsers.has(item.partner?.id || "") && (
          <View style={styles.onlineBadge} />
        )}
      </View>

      <View style={styles.contentContainer}>
        <View style={styles.headerRow}>
          <Text
            style={[
              styles.partnerName,
              item.unreadCount > 0 && styles.unreadText,
            ]}
            numberOfLines={1}
          >
            {item.partner?.name || "Unknown User"}
          </Text>
          <Text
            style={[styles.timeText, item.unreadCount > 0 && styles.unreadTime]}
          >
            {item.lastMessage
              ? formatTime(item.lastMessage.createdAt)
              : formatTime(item.lastActivityAt)}
          </Text>
        </View>

        <View style={styles.messageRow}>
          <Text
            style={[
              styles.lastMessage,
              item.unreadCount > 0 && styles.unreadMessage,
            ]}
            numberOfLines={1}
          >
            {item.lastMessage
              ? item.lastMessage.type === "call_invite"
                ? "📞 Voice Call"
                : item.lastMessage.content
              : "No messages yet"}
          </Text>
          {item.unreadCount > 0 && (
            <View style={styles.unreadBadge}>
              <Text style={styles.unreadBadgeText}>
                {item.unreadCount > 9 ? "9+" : item.unreadCount}
              </Text>
            </View>
          )}
        </View>
      </View>

      <Ionicons
        name="chevron-forward"
        size={16}
        color={theme.colors.text.light}
      />
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container}>
      <LinearGradient
        colors={theme.colors.gradients.surface as any}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.header}
      >
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Ionicons
            name="chevron-back"
            size={20}
            color={theme.colors.text.primary}
          />
        </TouchableOpacity>
        <View style={styles.headerTextWrap}>
          <Text style={styles.headerTitle}>Messages</Text>
          <Text style={styles.headerSubtitle}>Stay in sync with your partners</Text>
        </View>
        <View style={styles.headerRight} />
      </LinearGradient>

      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
        </View>
      ) : (
        <FlatList
          data={conversations}
          renderItem={renderItem}
          keyExtractor={(item) => item.conversationId}
          contentContainerStyle={styles.listContainer}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={theme.colors.primary}
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons
                name="chatbubbles-outline"
                size={64}
                color={theme.colors.text.light}
              />
              <Text style={styles.emptyTitle}>No messages yet</Text>
              <Text style={styles.emptySubtitle}>
                Connect with friends to start a conversation!
              </Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

const getStyles = (theme: any) =>
  StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: theme.spacing.m,
    paddingVertical: theme.spacing.s,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  headerTextWrap: {
    flex: 1,
    alignItems: "center",
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: `${theme.colors.primary}18`,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: theme.colors.text.primary,
  },
  headerSubtitle: {
    marginTop: 2,
    fontSize: 12,
    color: theme.colors.text.light,
  },
  headerRight: {
    width: 36,
  },
  centerContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  listContainer: {
    flexGrow: 1,
  },
  conversationItem: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: theme.spacing.m,
    marginTop: theme.spacing.s,
    padding: theme.spacing.m,
    borderRadius: theme.borderRadius.l,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    ...theme.shadows.small,
  },
  avatarContainer: {
    marginRight: 12,
  },
  avatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
  },
  onlineBadge: {
    position: "absolute",
    bottom: 2,
    right: 2,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: "#10B981",
    borderWidth: 2,
    borderColor: "#FFF",
  },
  avatarPlaceholder: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: `${theme.colors.primary}1E`,
    justifyContent: "center",
    alignItems: "center",
  },
  avatarInitial: {
    fontSize: 20,
    fontWeight: "600",
    color: theme.colors.text.secondary,
  },
  contentContainer: {
    flex: 1,
    marginRight: 8,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  partnerName: {
    fontSize: 16,
    fontWeight: "600",
    color: theme.colors.text.primary,
    flex: 1,
  },
  timeText: {
    fontSize: 12,
    color: theme.colors.text.light,
  },
  messageRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  lastMessage: {
    fontSize: 14,
    color: theme.colors.text.secondary,
    flex: 1,
    marginRight: 8,
  },
  unreadText: {
    fontWeight: "700",
    color: theme.colors.text.primary,
  },
  unreadMessage: {
    fontWeight: "600",
    color: theme.colors.text.primary,
  },
  unreadTime: {
    color: theme.colors.primary,
    fontWeight: "600",
  },
  unreadBadge: {
    backgroundColor: theme.colors.primary,
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 6,
  },
  unreadBadgeText: {
    color: "#FFF",
    fontSize: 10,
    fontWeight: "700",
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 32,
    paddingTop: 100,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: theme.colors.text.secondary,
    marginTop: 16,
  },
  emptySubtitle: {
    fontSize: 14,
    color: theme.colors.text.light,
    textAlign: "center",
    marginTop: 8,
  },
});
