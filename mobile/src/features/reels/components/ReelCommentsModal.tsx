import React, { useCallback, useEffect, useRef, useState } from "react";
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
  TextInput,
  Platform,
  Alert,
  Dimensions,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  KeyboardStickyView,
  useKeyboardHandler,
} from "react-native-keyboard-controller";
import { runOnJS } from "react-native-reanimated";
import { engagementApi, ReelComment } from "../../../api/engagement";
import { formatRelativeTime } from "../../../utils/formatRelativeTime";

const SHEET_HEIGHT = Math.round(Dimensions.get("window").height * 0.56);
const COMPOSER_ROW_HEIGHT = 56;

interface Props {
  visible: boolean;
  strapiReelId: number;
  reelTitle?: string;
  onClose: () => void;
  onCommentCountChange?: (count: number) => void;
}

export default function ReelCommentsModal({
  visible,
  strapiReelId,
  reelTitle,
  onClose,
  onCommentCountChange,
}: Props) {
  const insets = useSafeAreaInsets();
  const listRef = useRef<FlatList<ReelComment>>(null);
  const [loading, setLoading] = useState(false);
  const [posting, setPosting] = useState(false);
  const [comments, setComments] = useState<ReelComment[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [draft, setDraft] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const busy = posting || deletingId !== null;

  const [keyboardInset, setKeyboardInset] = useState(0);

  const scrollToBottom = useCallback((animated = true) => {
    requestAnimationFrame(() => {
      listRef.current?.scrollToEnd({ animated });
    });
  }, []);

  const listBottomPad =
    8 + keyboardInset + (keyboardInset > 0 ? COMPOSER_ROW_HEIGHT : 0);

  useKeyboardHandler(
    {
      onMove: (e) => {
        "worklet";
        runOnJS(setKeyboardInset)(e.height);
      },
      onEnd: (e) => {
        "worklet";
        runOnJS(setKeyboardInset)(e.height);
        runOnJS(scrollToBottom)();
      },
    },
    [scrollToBottom],
  );

  const syncCommentCount = useCallback(async () => {
    try {
      const engagement = await engagementApi.getReelEngagement(strapiReelId);
      const count = engagement.commentCount ?? 0;
      onCommentCountChange?.(count);
      return count;
    } catch {
      return null;
    }
  }, [strapiReelId, onCommentCountChange]);

  useEffect(() => {
    if (!visible) {
      setKeyboardInset(0);
    }
  }, [visible]);

  const loadComments = useCallback(
    async (cursor?: string) => {
      const isMore = !!cursor;
      if (isMore) setLoadingMore(true);
      else setLoading(true);
      try {
        const page = await engagementApi.getReelComments(
          strapiReelId,
          cursor,
        );
        setComments((prev) =>
          isMore ? [...prev, ...page.items] : page.items,
        );
        setNextCursor(page.nextCursor);
        if (!isMore) {
          await syncCommentCount();
          scrollToBottom(false);
        }
      } catch (err) {
        console.error("[ReelCommentsModal] load failed", err);
        if (!isMore) {
          Alert.alert(
            "Could not load comments",
            "Check your connection and try again.",
          );
        }
      } finally {
        if (isMore) setLoadingMore(false);
        else setLoading(false);
      }
    },
    [strapiReelId, syncCommentCount, scrollToBottom],
  );

  useEffect(() => {
    if (!visible) return;
    setDraft("");
    setComments([]);
    setNextCursor(null);
    void loadComments();
  }, [visible, loadComments]);

  const requestClose = useCallback(() => {
    if (busy) return;
    onClose();
  }, [busy, onClose]);

  const handleSend = async () => {
    const body = draft.trim();
    if (!body || posting) return;

    const optimisticId = `temp-${Date.now()}`;
    const optimistic: ReelComment = {
      id: optimisticId,
      body,
      createdAt: new Date().toISOString(),
      author: { id: "me", fname: "You", profileImage: null },
      isMine: true,
    };

    setPosting(true);
    setDraft("");
    setComments((prev) => [...prev, optimistic]);
    scrollToBottom();

    try {
      const saved = await engagementApi.postReelComment(strapiReelId, body);
      setComments((prev) =>
        prev.map((c) => (c.id === optimisticId ? saved : c)),
      );
      await syncCommentCount();
      scrollToBottom();
    } catch (err) {
      console.error("[ReelCommentsModal] post failed", err);
      setComments((prev) => prev.filter((c) => c.id !== optimisticId));
      setDraft(body);
      Alert.alert("Could not post comment", "Please try again.");
    } finally {
      setPosting(false);
    }
  };

  const confirmDelete = (comment: ReelComment) => {
    Alert.alert("Delete comment?", "This cannot be undone.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => void handleDelete(comment),
      },
    ]);
  };

  const handleDelete = async (comment: ReelComment) => {
    if (deletingId) return;
    setDeletingId(comment.id);
    const snapshot = comments;
    setComments((items) => items.filter((c) => c.id !== comment.id));

    try {
      await engagementApi.deleteReelComment(strapiReelId, comment.id);
      await syncCommentCount();
    } catch (err) {
      console.error("[ReelCommentsModal] delete failed", err);
      setComments(snapshot);
      await syncCommentCount();
      Alert.alert("Could not delete comment", "Please try again.");
    } finally {
      setDeletingId(null);
    }
  };

  const renderItem = ({ item }: { item: ReelComment }) => (
    <View style={styles.commentRow}>
      {item.author.profileImage ? (
        <Image source={{ uri: item.author.profileImage }} style={styles.avatar} />
      ) : (
        <View style={[styles.avatar, styles.avatarPlaceholder]}>
          <Text style={styles.avatarInitial}>
            {item.author.fname.charAt(0).toUpperCase() || "?"}
          </Text>
        </View>
      )}
      <View style={styles.commentBody}>
        <View style={styles.commentHeader}>
          <Text style={styles.authorName}>{item.author.fname}</Text>
          <Text style={styles.timeAgo}>{formatRelativeTime(item.createdAt)}</Text>
        </View>
        <Text style={styles.commentText}>{item.body}</Text>
      </View>
      {item.isMine && !item.id.startsWith("temp-") && (
        <TouchableOpacity
          style={styles.deleteBtn}
          disabled={deletingId === item.id || posting}
          onPress={() => confirmDelete(item)}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          {deletingId === item.id ? (
            <ActivityIndicator size="small" color="#9CA3AF" />
          ) : (
            <Ionicons name="trash-outline" size={18} color="#9CA3AF" />
          )}
        </TouchableOpacity>
      )}
    </View>
  );

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={requestClose}
      statusBarTranslucent
    >
      <View style={styles.root}>
        <Pressable
          style={styles.videoPeekArea}
          onPress={requestClose}
          accessibilityLabel="Close comments"
        />

        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <View style={styles.handle} />
          <Text style={styles.title} numberOfLines={1}>
            {reelTitle ? `Comments · ${reelTitle}` : "Comments"}
          </Text>

          {loading ? (
            <ActivityIndicator style={styles.loader} color="#FFF" />
          ) : (
            <FlatList
              ref={listRef}
              data={comments}
              keyExtractor={(item) => item.id}
              renderItem={renderItem}
              style={styles.list}
              contentContainerStyle={[
                comments.length === 0 ? styles.listEmptyContainer : undefined,
                { paddingBottom: listBottomPad },
              ]}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="interactive"
              onContentSizeChange={() => {
                if (comments.length > 0 && !loadingMore) scrollToBottom(false);
              }}
              ListEmptyComponent={
                <Text style={styles.emptyText}>
                  No comments yet — be the first to share what you learned.
                </Text>
              }
              ListFooterComponent={
                loadingMore ? (
                  <ActivityIndicator
                    style={{ marginVertical: 12 }}
                    color="#FFF"
                  />
                ) : nextCursor ? (
                  <TouchableOpacity
                    style={styles.loadMoreBtn}
                    onPress={() => void loadComments(nextCursor)}
                  >
                    <Text style={styles.loadMoreText}>Load more comments</Text>
                  </TouchableOpacity>
                ) : null
              }
            />
          )}
        </Pressable>

        <KeyboardStickyView offset={{ closed: 0, opened: insets.bottom }}>
          <View
            style={[
              styles.composer,
              { paddingBottom: Math.max(insets.bottom, 8) },
            ]}
          >
            <TextInput
              style={styles.input}
              placeholder="Add a comment..."
              placeholderTextColor="rgba(255,255,255,0.45)"
              value={draft}
              onChangeText={setDraft}
              onFocus={() => scrollToBottom()}
              multiline
              maxLength={500}
              editable={!posting}
              returnKeyType="default"
              blurOnSubmit={false}
            />
            <TouchableOpacity
              style={[
                styles.sendBtn,
                (!draft.trim() || posting) && styles.sendBtnDisabled,
              ]}
              disabled={!draft.trim() || posting}
              onPress={() => void handleSend()}
            >
              {posting ? (
                <ActivityIndicator size="small" color="#000" />
              ) : (
                <Text style={styles.sendLabel}>Send</Text>
              )}
            </TouchableOpacity>
          </View>
          {draft.length > 400 && (
            <Text style={styles.charCount}>{draft.length}/500</Text>
          )}
        </KeyboardStickyView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: "flex-end",
  },
  videoPeekArea: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.28)",
  },
  sheet: {
    height: SHEET_HEIGHT - COMPOSER_ROW_HEIGHT,
    backgroundColor: "#111827",
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingHorizontal: 16,
  },
  handle: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.25)",
    marginTop: 10,
    marginBottom: 8,
  },
  title: {
    color: "#FFF",
    fontSize: 16,
    fontWeight: "700",
    marginBottom: 8,
    textAlign: "center",
  },
  loader: {
    marginVertical: 24,
  },
  list: {
    flex: 1,
  },
  listEmptyContainer: {
    flexGrow: 1,
    justifyContent: "center",
  },
  emptyText: {
    color: "rgba(255,255,255,0.55)",
    textAlign: "center",
    fontSize: 14,
    lineHeight: 20,
    paddingHorizontal: 12,
  },
  commentRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingVertical: 10,
    gap: 10,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  avatarPlaceholder: {
    backgroundColor: "#374151",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarInitial: {
    color: "#E5E7EB",
    fontSize: 15,
    fontWeight: "600",
  },
  commentBody: {
    flex: 1,
  },
  commentHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 4,
  },
  authorName: {
    color: "#FFF",
    fontSize: 14,
    fontWeight: "700",
  },
  timeAgo: {
    color: "rgba(255,255,255,0.45)",
    fontSize: 12,
  },
  commentText: {
    color: "rgba(255,255,255,0.9)",
    fontSize: 14,
    lineHeight: 20,
  },
  deleteBtn: {
    paddingTop: 2,
  },
  loadMoreBtn: {
    alignItems: "center",
    paddingVertical: 10,
  },
  loadMoreText: {
    color: "rgba(255,255,255,0.6)",
    fontSize: 13,
  },
  composer: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(255,255,255,0.12)",
    paddingTop: 10,
    paddingHorizontal: 16,
    backgroundColor: "#111827",
  },
  input: {
    flex: 1,
    minHeight: 40,
    maxHeight: 96,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === "ios" ? 10 : 8,
    backgroundColor: "rgba(255,255,255,0.08)",
    color: "#FFF",
    fontSize: 15,
  },
  sendBtn: {
    minWidth: 64,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#FFF",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  sendBtnDisabled: {
    opacity: 0.45,
  },
  sendLabel: {
    color: "#000",
    fontSize: 14,
    fontWeight: "700",
  },
  charCount: {
    color: "rgba(255,255,255,0.4)",
    fontSize: 11,
    textAlign: "right",
    marginBottom: 4,
    paddingHorizontal: 16,
    backgroundColor: "#111827",
  },
});
