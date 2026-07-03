import React, { useEffect, useRef, useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  TouchableWithoutFeedback,
  TouchableOpacity,
} from "react-native";
import {
  Video,
  ResizeMode,
  AVPlaybackStatus,
  AVPlaybackStatusSuccess,
} from "expo-av";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { engagementApi } from "../../api/engagement";
import {
  getCachedEngagement,
  setCachedEngagement,
  setCachedCommentCount,
  patchCachedLike,
} from "../../api/engagementCache";
import ShareReelModal from "../../features/chat/components/ShareReelModal";
import ReelCommentsModal from "../../features/reels/components/ReelCommentsModal";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");

const WATCH_THRESHOLD_PERCENT = 80;
const DOUBLE_TAP_MS = 280;

interface Props {
  item: any;
  isActive: boolean;
  onWatchProgress?: (reelId: string, progressPercent: number) => void;
}

export default function EBiteVideoCard({
  item,
  isActive,
  onWatchProgress,
}: Props) {
  const videoRef = useRef<Video>(null);
  const [status, setStatus] = useState<AVPlaybackStatusSuccess | null>(null);
  const [isPausedByUser, setIsPausedByUser] = useState(false);
  const [liked, setLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(0);
  const [commentCount, setCommentCount] = useState(0);
  const [shareVisible, setShareVisible] = useState(false);
  const [commentsVisible, setCommentsVisible] = useState(false);
  const [wasPausedBeforeComments, setWasPausedBeforeComments] = useState(false);
  const [showFireBurst, setShowFireBurst] = useState(false);
  const hasReportedUnlock = useRef(false);
  const lastTapRef = useRef(0);
  const singleTapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const reelId = Number(item.id);
  const muxPlaybackId =
    typeof item.videoUrl === "string"
      ? item.videoUrl.match(/stream\.mux\.com\/([^/.]+)/)?.[1]
      : undefined;
  const reelSnapshot =
    reelId && !Number.isNaN(reelId)
      ? {
          title: String(item.title || "eBite"),
          muxPlaybackId,
          thumbnailUrl: muxPlaybackId
            ? `https://image.mux.com/${muxPlaybackId}/thumbnail.jpg`
            : null,
        }
      : undefined;

  useEffect(() => {
    if (!reelId || Number.isNaN(reelId)) return;
    const cached = getCachedEngagement(reelId);
    if (cached) {
      setLiked(cached.likedByMe);
      setLikeCount(cached.totalLikes);
      setCommentCount(cached.commentCount ?? 0);
    }
    engagementApi
      .getReelEngagement(reelId)
      .then((data) => {
        setLiked(data.likedByMe);
        setLikeCount(data.totalLikes);
        setCommentCount(data.commentCount ?? 0);
        setCachedEngagement(
          reelId,
          data.likedByMe,
          data.totalLikes,
          data.commentCount ?? 0,
        );
      })
      .catch(() => {});
  }, [reelId]);

  const handleCommentCountChange = useCallback(
    (count: number) => {
      setCommentCount(count);
      if (!Number.isNaN(reelId)) {
        setCachedCommentCount(reelId, count);
      }
    },
    [reelId],
  );

  const openComments = useCallback(() => {
    setWasPausedBeforeComments(isPausedByUser);
    setIsPausedByUser(true);
    setCommentsVisible(true);
  }, [isPausedByUser]);

  const closeComments = useCallback(() => {
    setCommentsVisible(false);
    if (!wasPausedBeforeComments) {
      setIsPausedByUser(false);
    }
  }, [wasPausedBeforeComments]);

  useEffect(() => {
    if (!isActive && commentsVisible) {
      closeComments();
    }
  }, [isActive, commentsVisible, closeComments]);

  useEffect(() => {
    if (!videoRef.current) return;
    const shouldPlay = isActive && !isPausedByUser && !commentsVisible;
    if (shouldPlay) {
      videoRef.current.playAsync();
    } else {
      videoRef.current.pauseAsync();
    }
  }, [isActive, isPausedByUser, commentsVisible]);

  useEffect(() => {
    return () => {
      if (singleTapTimerRef.current) {
        clearTimeout(singleTapTimerRef.current);
      }
    };
  }, []);

  const handlePlaybackStatusUpdate = (update: AVPlaybackStatus) => {
    if (update.isLoaded) {
      setStatus(update);
      const duration = update.durationMillis ?? 0;
      const position = update.positionMillis ?? 0;
      const progressPercent = duration > 0 ? (position / duration) * 100 : 0;
      if (
        onWatchProgress &&
        progressPercent >= WATCH_THRESHOLD_PERCENT &&
        !hasReportedUnlock.current
      ) {
        hasReportedUnlock.current = true;
        onWatchProgress(String(item.id), progressPercent);
      }
    }
  };

  const togglePlayPause = () => {
    setIsPausedByUser((prev) => !prev);
  };

  const flashFireBurst = useCallback(() => {
    setShowFireBurst(true);
    setTimeout(() => setShowFireBurst(false), 650);
  }, []);

  const toggleLike = useCallback(async () => {
    if (!reelId || Number.isNaN(reelId)) return;
    const prevLiked = liked;
    const prevCount = likeCount;
    setLiked(!prevLiked);
    setLikeCount(prevLiked ? Math.max(0, prevCount - 1) : prevCount + 1);
    patchCachedLike(reelId, !prevLiked);
    try {
      const result = await engagementApi.toggleReelLike(reelId);
      setLiked(result.liked);
      setLikeCount(result.totalLikes);
      setCachedEngagement(reelId, result.liked, result.totalLikes, commentCount);
    } catch {
      setLiked(prevLiked);
      setLikeCount(prevCount);
      setCachedEngagement(reelId, prevLiked, prevCount, commentCount);
    }
  }, [reelId, liked, likeCount]);

  const likeFromDoubleTap = useCallback(() => {
    flashFireBurst();
    if (!liked) {
      void toggleLike();
    }
  }, [flashFireBurst, liked, toggleLike]);

  const handleVideoPress = () => {
    const now = Date.now();
    if (now - lastTapRef.current < DOUBLE_TAP_MS) {
      if (singleTapTimerRef.current) {
        clearTimeout(singleTapTimerRef.current);
        singleTapTimerRef.current = null;
      }
      lastTapRef.current = 0;
      likeFromDoubleTap();
      return;
    }
    lastTapRef.current = now;
    singleTapTimerRef.current = setTimeout(() => {
      singleTapTimerRef.current = null;
      togglePlayPause();
    }, DOUBLE_TAP_MS);
  };

  const progress =
    status && status.durationMillis
      ? (status.positionMillis / status.durationMillis) * 100
      : 0;

  return (
    <View style={styles.container}>
      <TouchableWithoutFeedback onPress={handleVideoPress}>
        <View style={styles.tapArea}>
          <Video
            ref={videoRef}
            source={{ uri: item.videoUrl }}
            style={styles.video}
            resizeMode={ResizeMode.COVER}
            isLooping
            onPlaybackStatusUpdate={handlePlaybackStatusUpdate}
            shouldPlay={isActive && !isPausedByUser && !commentsVisible}
          />

          {showFireBurst && (
            <View style={styles.fireBurstOverlay} pointerEvents="none">
              <Text style={styles.fireBurstEmoji}>🔥</Text>
            </View>
          )}

          {isPausedByUser && (
            <View style={styles.pauseOverlay}>
              <Ionicons name="play" size={64} color="rgba(255,255,255,0.7)" />
            </View>
          )}

          <LinearGradient
            colors={["transparent", "rgba(0,0,0,0.8)"]}
            style={[styles.overlay, { paddingBottom: insets.bottom + 80 }]}
          >
            <View style={styles.bottomContent}>
              <Text style={styles.title}>{item.title}</Text>
              {item.description && (
                <Text style={styles.description}>{item.description}</Text>
              )}
            </View>

            <View
              style={[
                styles.progressBarContainer,
                { bottom: insets.bottom + 75 },
              ]}
            >
              <View style={[styles.progressBar, { width: `${progress}%` }]} />
            </View>
          </LinearGradient>
        </View>
      </TouchableWithoutFeedback>

      <View style={[styles.actionRail, { bottom: insets.bottom + 100 }]}>
        <TouchableOpacity style={styles.actionBtn} onPress={toggleLike}>
          <Text style={[styles.fireEmoji, liked && styles.fireEmojiActive]}>
            🔥
          </Text>
          {likeCount > 0 && (
            <Text style={styles.actionCount}>{likeCount}</Text>
          )}
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionBtn} onPress={openComments}>
          <Ionicons name="chatbubble-outline" size={28} color="#FFF" />
          {commentCount > 0 && (
            <Text style={styles.actionCount}>{commentCount}</Text>
          )}
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.actionBtn}
          onPress={() => setShareVisible(true)}
        >
          <Ionicons name="paper-plane-outline" size={28} color="#FFF" />
        </TouchableOpacity>
      </View>

      {!Number.isNaN(reelId) && (
        <ReelCommentsModal
          visible={commentsVisible}
          strapiReelId={reelId}
          reelTitle={String(item.title || "eBite")}
          onClose={closeComments}
          onCommentCountChange={handleCommentCountChange}
        />
      )}

      {!Number.isNaN(reelId) && (
        <ShareReelModal
          visible={shareVisible}
          strapiReelId={reelId}
          reelSnapshot={reelSnapshot}
          onClose={() => setShareVisible(false)}
          onSharedToChat={(target) => {
            const rootNav = navigation.getParent() ?? navigation;
            rootNav.navigate("Chat", target);
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
    backgroundColor: "#000",
  },
  tapArea: {
    flex: 1,
    width: "100%",
    height: "100%",
  },
  video: {
    width: "100%",
    height: "100%",
  },
  fireBurstOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.12)",
  },
  fireBurstEmoji: {
    fontSize: 88,
    textShadowColor: "rgba(255,120,0,0.6)",
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 16,
  },
  pauseOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.2)",
  },
  actionRail: {
    position: "absolute",
    right: 12,
    alignItems: "center",
    gap: 20,
    zIndex: 5,
  },
  actionBtn: {
    alignItems: "center",
  },
  fireEmoji: {
    fontSize: 30,
    opacity: 0.55,
  },
  fireEmojiActive: {
    opacity: 1,
    transform: [{ scale: 1.12 }],
  },
  actionCount: {
    color: "#FFF",
    fontSize: 12,
    fontWeight: "600",
    marginTop: 2,
  },
  overlay: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    paddingTop: 60,
    paddingBottom: 90,
    paddingHorizontal: 20,
  },
  bottomContent: {
    marginBottom: 10,
  },
  title: {
    color: "#fff",
    fontSize: 22,
    fontWeight: "bold",
    marginBottom: 8,
  },
  description: {
    color: "#rgba(255,255,255,0.8)",
    fontSize: 15,
    lineHeight: 22,
  },
  progressBarContainer: {
    height: 3,
    backgroundColor: "rgba(255,255,255,0.3)",
    width: "100%",
    borderRadius: 2,
    overflow: "hidden",
    position: "absolute",
    bottom: 85,
    left: 20,
    right: 20,
  },
  progressBar: {
    height: "100%",
    backgroundColor: "#fff",
  },
});
