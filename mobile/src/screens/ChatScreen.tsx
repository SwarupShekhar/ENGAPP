import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
} from "react-native";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import { useAuth } from "@clerk/clerk-expo";
import { Ionicons } from "@expo/vector-icons";
import { Audio } from "expo-av";
import { chatApi } from "../api/connections";
import SocketService from "../services/socketService";

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
}

// ── Main Component ──────────────────────────────────────

export default function ChatScreen() {
  const navigation = useNavigation();
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

  const flatListRef = useRef<FlatList>(null);
  const socketService = useRef(SocketService.getInstance()).current;
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [internalUserId, setInternalUserId] = useState<string>("");
  const soundRef = useRef<Audio.Sound | null>(null);

  // ── Init socket + load messages ─────────────────────

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

        // Load messages
        const msgs = await chatApi.getMessages(conversationId);
        if (mounted) {
          setMessages(msgs);
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

  // ── Render Functions ────────────────────────────────

  const isMyMessage = (msg: ChatMessage) => msg.senderId !== partnerId;

  const renderMessage = ({ item }: { item: ChatMessage }) => {
    const isMine = isMyMessage(item);

    if (item.type === "call_invite") {
      return (
        <View style={styles.callInviteContainer}>
          <View style={styles.callInviteBubble}>
            <Ionicons name="call" size={16} color="#A78BFA" />
            <Text style={styles.callInviteText}>{item.content}</Text>
          </View>
        </View>
      );
    }

    if (item.type === "system") {
      return (
        <View style={styles.systemContainer}>
          <Text style={styles.systemText}>{item.content}</Text>
        </View>
      );
    }

    return (
      <View
        style={[
          styles.messageRow,
          isMine ? styles.messageRowRight : styles.messageRowLeft,
        ]}
      >
        <View
          style={[
            styles.messageBubble,
            isMine ? styles.myBubble : styles.theirBubble,
          ]}
        >
          <Text
            style={[
              styles.messageText,
              isMine ? styles.myMessageText : styles.theirMessageText,
            ]}
          >
            {item.content}
          </Text>
          <View style={styles.messageFooter}>
            <Text
              style={[
                styles.messageTime,
                isMine ? styles.myTimeText : styles.theirTimeText,
              ]}
            >
              {new Date(item.createdAt).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </Text>
            {isMine && item.readBy?.includes(partnerId) && (
              <Text style={styles.seenText}>Seen</Text>
            )}
          </View>
        </View>
      </View>
    );
  };

  // ── Main Render ─────────────────────────────────────

  return (
    <SafeAreaView style={styles.container}>
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
          <Ionicons name="chevron-back" size={24} color="#FFF" />
        </TouchableOpacity>

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
          <Ionicons name="call" size={22} color="#A78BFA" />
        </TouchableOpacity>
      </View>

      {/* Messages */}
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={0}
      >
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#A78BFA" />
            <Text style={styles.loadingText}>Loading messages...</Text>
          </View>
        ) : (
          <FlatList
            ref={flatListRef}
            data={messages}
            renderItem={renderMessage}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.messagesList}
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

        {/* Typing Indicator */}
        {partnerTyping && (
          <View style={styles.typingBar}>
            <Text style={styles.typingText}>{partnerName} is typing</Text>
            <Text style={styles.typingDots}>...</Text>
          </View>
        )}

        {/* Input */}
        <View style={styles.inputContainer}>
          <TextInput
            style={styles.textInput}
            value={inputText}
            onChangeText={handleTextChange}
            placeholder="Type a message..."
            placeholderTextColor="#6B7280"
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
              color={inputText.trim() ? "#FFF" : "#6B7280"}
            />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ── Styles ──────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0F0F1A",
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
    borderBottomColor: "rgba(255,255,255,0.08)",
    backgroundColor: "#161625",
  },
  backButton: {
    padding: 4,
    marginRight: 8,
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
    color: "#FFF",
    marginRight: 8,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  headerStatus: {
    fontSize: 12,
    color: "#9CA3AF",
    marginTop: 2,
  },
  callButton: {
    padding: 10,
    borderRadius: 20,
    backgroundColor: "rgba(167,139,250,0.15)",
  },

  // Messages
  messagesList: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
  messageRow: {
    marginBottom: 8,
    maxWidth: "80%",
  },
  messageRowRight: {
    alignSelf: "flex-end",
  },
  messageRowLeft: {
    alignSelf: "flex-start",
  },
  messageBubble: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 18,
  },
  myBubble: {
    backgroundColor: "#7C3AED",
    borderBottomRightRadius: 4,
  },
  theirBubble: {
    backgroundColor: "#1F1F35",
    borderBottomLeftRadius: 4,
  },
  messageText: {
    fontSize: 15,
    lineHeight: 20,
  },
  myMessageText: {
    color: "#FFF",
  },
  theirMessageText: {
    color: "#E5E7EB",
  },
  messageTime: {
    fontSize: 10,
    marginTop: 4,
    alignSelf: "flex-end",
  },
  myTimeText: {
    color: "rgba(255,255,255,0.6)",
  },
  theirTimeText: {
    color: "rgba(255,255,255,0.4)",
  },
  messageFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 4,
    marginTop: 4,
  },
  seenText: {
    fontSize: 10,
    color: "#A78BFA",
    fontWeight: "600",
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
    backgroundColor: "rgba(167,139,250,0.1)",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(167,139,250,0.2)",
  },
  callInviteText: {
    fontSize: 13,
    color: "#A78BFA",
  },

  // System message
  systemContainer: {
    alignItems: "center",
    marginVertical: 8,
  },
  systemText: {
    fontSize: 12,
    color: "#6B7280",
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
    color: "#9CA3AF",
  },
  typingDots: {
    fontSize: 14,
    color: "#A78BFA",
    fontWeight: "700",
  },

  // Input
  inputContainer: {
    flexDirection: "row",
    alignItems: "flex-end",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.08)",
    backgroundColor: "#161625",
  },
  textInput: {
    flex: 1,
    backgroundColor: "#1F1F35",
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 15,
    color: "#FFF",
    maxHeight: 100,
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
    backgroundColor: "#7C3AED",
  },
  sendButtonInactive: {
    backgroundColor: "#1F1F35",
  },

  // Loading
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  loadingText: {
    color: "#9CA3AF",
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
    color: "#6B7280",
    fontSize: 15,
    textAlign: "center",
  },
});
