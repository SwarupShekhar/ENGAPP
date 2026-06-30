import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  View,
  Text,
  FlatList,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Pressable,
} from "react-native";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import {
  KeyboardStickyView,
  useKeyboardHandler,
} from "react-native-keyboard-controller";
import { runOnJS } from "react-native-reanimated";
import {
  useNavigation,
  useRoute,
  RouteProp,
  NavigationProp,
} from "@react-navigation/native";
import type { RootStackParamList } from "../../../navigation/RootNavigator";
import { useAuth } from "@clerk/clerk-expo";
import { Ionicons } from "@expo/vector-icons";
import { Audio } from "expo-av";
import { chatApi } from "../../../api/connections";
import { userApi } from "../../../api/user";
import { engagementApi, AggregatedReaction } from "../../../api/engagement";
import SocketService from "../../call/services/socketService";
import { useAppTheme } from "../../../theme/useAppTheme";
import EmojiPickerSheet from "../components/EmojiPickerSheet";
import type { ReelShareMetadata } from "../components/ReelShareCard";
import { groupChatListItems, ChatListItem as GroupedChatListItem, RUN_GAP_MS } from "../logic/groupChatListItems";
import MessageRunRow from "../components/MessageRunRow";
import { chatThreadTheme } from "../theme/chatTheme";

const QUICK_REACTIONS = ["❤️", "😂", "😮", "😢", "😡", "👍"];
/** Composer row height (emoji + input + send) — keeps last bubble above the bar */
const COMPOSER_ROW_HEIGHT = 56;
/** Dark text on the light IG-style composer pill (theme text.primary is light on dark app chrome) */
const CHAT_COMPOSER_TEXT = "#111827";
const CHAT_COMPOSER_PLACEHOLDER = "#6B7280";

// ── Types ───────────────────────────────────────────────

type ChatRouteParams = {
  Chat: {
    conversationId: string;
    partnerId: string;
    partnerName: string;
    partnerAvatar?: string;
  };
};

interface ChatMessage {
  id: string;
  content: string;
  type: string;
  senderId: string;
  sender: { id: string; name: string; profileImage: string | null };
  createdAt: string;
  readBy?: string[];
  metadata?: any;
  reactions?: AggregatedReaction[];
}


// ── Main Component ──────────────────────────────────────

export default function ChatScreen() {
  const theme = useAppTheme();
  const styles = getStyles(theme);
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const route = useRoute<RouteProp<ChatRouteParams, "Chat">>();
  const { conversationId, partnerId, partnerName, partnerAvatar } =
    route.params;
  const { getToken, userId: clerkUserId } = useAuth();
  const insets = useSafeAreaInsets();

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [partnerOnline, setPartnerOnline] = useState(false);
  const [partnerTyping, setPartnerTyping] = useState(false);
  const [emojiPickerVisible, setEmojiPickerVisible] = useState(false);
  const [reactionTarget, setReactionTarget] = useState<ChatMessage | null>(
    null,
  );
  const [messageReactions, setMessageReactions] = useState<
    Record<string, AggregatedReaction[]>
  >({});

  const flatListRef = useRef<FlatList>(null);
  const socketService = useRef(SocketService.getInstance()).current;
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [internalUserId, setInternalUserId] = useState<string>("");
  const soundRef = useRef<Audio.Sound | null>(null);

  // ── Init socket + load messages ─────────────────────
  useEffect(() => {
    let mounted = true;

    async function init() {
      try {
        // Connect socket
        const token = await getToken();
        if (token) {
          socketService.connect(token);
          socketService.joinConversation(conversationId);
          socketService.markRead(conversationId);
        }

        const myId = await userApi.getCurrentUserId();
        if (mounted && myId) {
          setInternalUserId(myId);
        }

        // Load messages
        const msgs = await chatApi.getMessages(conversationId);
        if (mounted) {
          setMessages(msgs);
          const initialReactions: Record<string, AggregatedReaction[]> = {};
          for (const msg of msgs as ChatMessage[]) {
            if (msg.reactions?.length) {
              initialReactions[msg.id] = msg.reactions;
            }
          }
          setMessageReactions(initialReactions);
          setLoading(false);

          // Infer internal userId from messages if possible
          if (msgs.length > 0) {
            const myMsg = msgs.find(
              (m: ChatMessage) => m.senderId !== partnerId,
            );
            if (myMsg) setInternalUserId(myMsg.senderId);
          }
        }
      } catch (err) {
        console.error("[ChatScreen] Init error:", err);
        if (mounted) setLoading(false);
      }
    }

    init();
    return () => {
      mounted = false;
    };
  }, [conversationId]);

  // ── Socket listeners ────────────────────────────────
  useEffect(() => {
    const handleNewMessage = (data: {
      conversationId: string;
      message: ChatMessage;
    }) => {
      if (data.conversationId !== conversationId) return;

      // Play sound if message is from partner
      // (Removed local call as it's now handled globally by SocketService)

      setMessages((prev) => {
        const alreadyExists = prev.some((m) => m.id === data.message.id);
        if (alreadyExists) return prev;
        return [...prev, data.message];
      });

      requestAnimationFrame(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      });

      socketService.markRead(conversationId);

      // Infer internal userId
      if (data.message.senderId !== partnerId && !internalUserId) {
        setInternalUserId(data.message.senderId);
      }
    };

    const handleTyping = (data: {
      conversationId: string;
      userId: string;
      isTyping: boolean;
    }) => {
      if (data.conversationId !== conversationId) return;
      if (data.userId === partnerId) {
        setPartnerTyping(data.isTyping);
      }
    };

    const handlePresence = (data: { userId: string; status: string }) => {
      if (data.userId === partnerId) {
        setPartnerOnline(data.status === "online");
      }
    };

    const handleRead = (data: {
      conversationId: string;
      readByUserId: string;
      readAt: string;
    }) => {
      if (data.conversationId !== conversationId) return;
      if (data.readByUserId === partnerId) {
        // Update messages to include partner in readBy
        setMessages((prev) =>
          prev.map((msg) => {
            if (
              msg.senderId !== partnerId &&
              !msg.readBy?.includes(partnerId)
            ) {
              return { ...msg, readBy: [...(msg.readBy || []), partnerId] };
            }
            return msg;
          }),
        );
      }
    };
    socketService.onNewMessage(handleNewMessage);
    socketService.onUserTyping(handleTyping);
    socketService.onPresenceUpdate(handlePresence);
    socketService.onMessagesRead(handleRead);

    const handleReactionUpdated = (data: {
      conversationId: string;
      messageId: string;
      reactions: AggregatedReaction[];
    }) => {
      if (data.conversationId !== conversationId) return;
      setMessageReactions((prev) => ({
        ...prev,
        [data.messageId]: data.reactions,
      }));
    };
    socketService.onReactionUpdated(handleReactionUpdated);

    const handleConnect = () => {
      console.log("[ChatScreen] Socket connected, fetching presence");
      socketService.getOnlineUsers((data) => {
        if (data.onlineUserIds.includes(partnerId)) {
          setPartnerOnline(true);
        }
      });
    };

    socketService.on("connect", handleConnect);
    if (socketService.isConnected()) {
      handleConnect();
    }

    return () => {
      socketService.offNewMessage(handleNewMessage);
      socketService.offUserTyping(handleTyping);
      socketService.offPresenceUpdate(handlePresence);
      socketService.offMessagesRead(handleRead);
      socketService.offReactionUpdated(handleReactionUpdated);
      socketService.off("connect", handleConnect);
    };
  }, [conversationId, partnerId, internalUserId]);

  // ── Actions ─────────────────────────────────────────

  const handleSend = useCallback(async () => {
    const trimmed = inputText.trim();
    if (!trimmed || sending) return;

    setSending(true);
    setInputText("");

    // Stop typing indicator
    socketService.sendTypingStop(conversationId);

    // Send via socket (optimistic)
    socketService.sendMessage(conversationId, trimmed);
    setSending(false);
  }, [inputText, conversationId, sending]);

  const handleTextChange = useCallback(
    (text: string) => {
      setInputText(text);

      if (text.length > 0) {
        socketService.sendTypingStart(conversationId);

        // Auto-stop typing after 2s
        if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = setTimeout(() => {
          socketService.sendTypingStop(conversationId);
        }, 2000);
      } else {
        socketService.sendTypingStop(conversationId);
      }
    },
    [conversationId],
  );

  const handleCall = useCallback(() => {
    Alert.alert(
      "Start a Call?",
      `Would you like to start a voice call with ${partnerName}?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Call",
          onPress: () => {
            const callId = `call_${Date.now()}`;
            socketService.sendCallInvite(conversationId, callId, "voice");
            // Navigate directly to call screen for friend session
            (navigation as any).navigate("InCall", {
              sessionId: conversationId,
              partnerName: partnerName,
              isDirect: true,
              isCaller: true,
            });
          },
        },
      ],
    );
  }, [conversationId, partnerName]);

  const handleReaction = useCallback(
    async (message: ChatMessage, emoji: string) => {
      setReactionTarget(null);
      try {
        const reactions = await engagementApi.setMessageReaction(
          message.id,
          emoji,
        );
        setMessageReactions((prev) => ({ ...prev, [message.id]: reactions }));
      } catch (err) {
        console.error("[ChatScreen] Reaction error:", err);
      }
    },
    [],
  );

  const openReelViewer = useCallback(
    (metadata: ReelShareMetadata) => {
      navigation.navigate("ReelViewer", {
        reelId: metadata.strapiReelId,
      });
    },
    [navigation],
  );

  // ── Render Functions ────────────────────────────────

  const listItems = useMemo<GroupedChatListItem[]>(() => {
    return groupChatListItems(messages as any[], {
      partnerId,
      runGapMs: RUN_GAP_MS,
    });
  }, [messages, partnerId]);

  const renderListItem = ({ item }: { item: GroupedChatListItem }) => {
    if (item.kind === "date") {
      return (
        <View style={styles.dateSeparator}>
          <Text style={styles.dateSeparatorText}>{item.label}</Text>
        </View>
      );
    }

    if (item.kind === "system") {
      return (
        <View style={styles.systemContainer}>
          <Text style={styles.systemText}>{item.content}</Text>
        </View>
      );
    }

    if (item.kind === "call_invite") {
      const msg = item.message;
      return (
        <View style={styles.callInviteContainer}>
          <View style={styles.callInviteBubble}>
            <Ionicons name="call" size={16} color="#A78BFA" />
            <Text style={styles.callInviteText}>{msg.content}</Text>
          </View>
        </View>
      );
    }

    if (item.kind === "run") {
      return (
        <MessageRunRow
          run={item}
          messageReactions={messageReactions}
          onLongPressMessage={(msg) => setReactionTarget(msg as any)}
          onOpenReel={openReelViewer}
          primaryColor={theme.colors.primary}
        />
      );
    }

    return null;
  };

  // ── Main Render ─────────────────────────────────────

  const scrollToLatest = useCallback(() => {
    requestAnimationFrame(() => {
      flatListRef.current?.scrollToEnd({ animated: true });
    });
  }, []);

  const [keyboardInset, setKeyboardInset] = useState(0);

  useKeyboardHandler(
    {
      onMove: (e) => {
        "worklet";
        runOnJS(setKeyboardInset)(e.height);
      },
      onEnd: (e) => {
        "worklet";
        runOnJS(setKeyboardInset)(e.height);
        runOnJS(scrollToLatest)();
      },
    },
    [scrollToLatest],
  );

  const listBottomPad =
    COMPOSER_ROW_HEIGHT + Math.max(insets.bottom, 10) + keyboardInset;

  useEffect(() => {
    if (!loading && messages.length > 0) {
      scrollToLatest();
    }
  }, [loading, messages.length, scrollToLatest, keyboardInset]);

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      {/* Header */}
      <View
        style={[
          styles.header,
          { paddingTop: Math.max(insets.top, 14), paddingBottom: 14 },
        ]}
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

        {partnerAvatar ? (
          <Image source={{ uri: partnerAvatar }} style={styles.headerAvatar} />
        ) : (
          <View style={styles.headerAvatarPlaceholder}>
            <Text style={styles.headerAvatarInitial}>
              {partnerName.charAt(0).toUpperCase()}
            </Text>
          </View>
        )}

        <View style={styles.headerInfo}>
          <View style={styles.headerNameRow}>
            <Text style={styles.headerName}>{partnerName}</Text>
            <View
              style={[
                styles.statusDot,
                { backgroundColor: partnerOnline ? "#34D399" : "#6B7280" },
              ]}
            />
          </View>
          <Text style={styles.headerStatus}>
            {partnerTyping ? "typing..." : partnerOnline ? "online" : "offline"}
          </Text>
        </View>

        <TouchableOpacity style={styles.callButton} onPress={handleCall}>
          <Ionicons name="call" size={22} color={theme.colors.primary} />
        </TouchableOpacity>
      </View>

      {/* Messages + composer — sticky input tracks keyboard on iOS & Android */}
      <View style={styles.flex}>
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={theme.colors.primary} />
            <Text style={styles.loadingText}>Loading messages...</Text>
          </View>
        ) : (
          <FlatList
            ref={flatListRef}
            data={listItems}
            renderItem={renderListItem}
            keyExtractor={(item) => item.id}
            style={styles.flex}
            contentContainerStyle={[
              styles.messagesList,
              { paddingBottom: listBottomPad },
            ]}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
            onContentSizeChange={() =>
              flatListRef.current?.scrollToEnd({ animated: false })
            }
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Ionicons
                  name="chatbubbles-outline"
                  size={48}
                  color="#6B7280"
                />
                <Text style={styles.emptyText}>
                  Start a conversation with {partnerName}!
                </Text>
              </View>
            }
          />
        )}

        {partnerTyping && (
          <View style={styles.typingBar}>
            <Text style={styles.typingText}>{partnerName} is typing</Text>
            <Text style={styles.typingDots}>...</Text>
          </View>
        )}

        <KeyboardStickyView
          offset={{ closed: 0, opened: insets.bottom }}
        >
          <View
            style={[
              styles.inputContainer,
              { paddingBottom: Math.max(insets.bottom, 10) },
            ]}
          >
            <TouchableOpacity
              style={styles.emojiButton}
              onPress={() => setEmojiPickerVisible(true)}
            >
              <Ionicons
                name="happy-outline"
                size={24}
                color={theme.colors.text.light}
              />
            </TouchableOpacity>
            <TextInput
              style={styles.textInput}
              value={inputText}
              onChangeText={handleTextChange}
              onFocus={scrollToLatest}
              placeholder="Message..."
              placeholderTextColor={CHAT_COMPOSER_PLACEHOLDER}
              multiline
              maxLength={1000}
            />
            <TouchableOpacity
              style={[
                styles.sendButton,
                inputText.trim()
                  ? styles.sendButtonActive
                  : styles.sendButtonInactive,
              ]}
              onPress={handleSend}
              disabled={!inputText.trim() || sending}
            >
              <Ionicons
                name="send"
                size={20}
                color={inputText.trim() ? "#FFF" : theme.colors.text.light}
              />
            </TouchableOpacity>
          </View>
        </KeyboardStickyView>
      </View>

      <EmojiPickerSheet
        visible={emojiPickerVisible}
        onClose={() => setEmojiPickerVisible(false)}
        onSelect={(emoji) => setInputText((prev) => prev + emoji)}
      />

      <Modal
        visible={reactionTarget !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setReactionTarget(null)}
      >
        <Pressable
          style={styles.reactionOverlay}
          onPress={() => setReactionTarget(null)}
        >
          <View style={styles.reactionBar}>
            {QUICK_REACTIONS.map((emoji) => (
              <TouchableOpacity
                key={emoji}
                style={styles.reactionButton}
                onPress={() =>
                  reactionTarget && handleReaction(reactionTarget, emoji)
                }
              >
                <Text style={styles.reactionEmoji}>{emoji}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

// ── Styles ──────────────────────────────────────────────

const getStyles = (theme: any) =>
  StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: chatThreadTheme.canvas,
  },
  flex: {
    flex: 1,
  },

  // Header
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: `${theme.colors.primary}18`,
    marginRight: 8,
  },
  headerAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    marginRight: 10,
  },
  headerAvatarPlaceholder: {
    width: 36,
    height: 36,
    borderRadius: 18,
    marginRight: 10,
    backgroundColor: "#E5E7EB",
    alignItems: "center",
    justifyContent: "center",
  },
  headerAvatarInitial: {
    fontSize: 16,
    fontWeight: "600",
    color: "#6B7280",
  },
  headerInfo: {
    flex: 1,
  },
  headerNameRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  headerName: {
    fontSize: 17,
    fontWeight: "600",
    color: theme.colors.text.primary,
    marginRight: 8,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  headerStatus: {
    fontSize: 12,
    color: theme.colors.text.light,
    marginTop: 2,
  },
  callButton: {
    padding: 10,
    borderRadius: 20,
    backgroundColor: `${theme.colors.primary}1F`,
  },

  // Messages
  messagesList: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
  dateSeparator: {
    alignItems: "center",
    marginVertical: 12,
  },
  dateSeparatorText: {
    fontSize: 12,
    fontWeight: "600",
    color: chatThreadTheme.dateSeparatorText,
    backgroundColor: chatThreadTheme.dateSeparatorBg,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    overflow: "hidden",
  },

  // Call invite
  callInviteContainer: {
    alignItems: "center",
    marginVertical: 12,
  },
  callInviteBubble: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: `${theme.colors.primary}18`,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: `${theme.colors.primary}45`,
  },
  callInviteText: {
    fontSize: 13,
    color: theme.colors.primary,
  },

  // System message
  systemContainer: {
    alignItems: "center",
    marginVertical: 8,
  },
  systemText: {
    fontSize: 12,
    color: theme.colors.text.light,
    fontStyle: "italic",
  },

  // Typing
  typingBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 6,
  },
  typingText: {
    fontSize: 12,
    color: theme.colors.text.light,
  },
  typingDots: {
    fontSize: 14,
    color: theme.colors.primary,
    fontWeight: "700",
  },

  // Input
  inputContainer: {
    flexDirection: "row",
    alignItems: "flex-end",
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    gap: 4,
  },
  emojiButton: {
    width: 36,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  textInput: {
    flex: 1,
    backgroundColor: "#F2F2F2",
    borderRadius: 22,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    color: CHAT_COMPOSER_TEXT,
    maxHeight: 100,
  },
  reactionOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.25)",
    justifyContent: "center",
    alignItems: "center",
  },
  reactionBar: {
    flexDirection: "row",
    backgroundColor: "#FFF",
    borderRadius: 28,
    paddingHorizontal: 8,
    paddingVertical: 6,
    gap: 4,
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
  },
  reactionButton: {
    paddingHorizontal: 6,
    paddingVertical: 4,
  },
  reactionEmoji: {
    fontSize: 26,
  },
  sendButton: {
    marginLeft: 8,
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  sendButtonActive: {
    backgroundColor: theme.colors.primary,
  },
  sendButtonInactive: {
    backgroundColor: `${theme.colors.primary}22`,
  },

  // Loading
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  loadingText: {
    color: theme.colors.text.light,
    fontSize: 14,
  },

  // Empty
  emptyContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 100,
    gap: 16,
  },
  emptyText: {
    color: theme.colors.text.light,
    fontSize: 15,
    textAlign: "center",
  },
});
