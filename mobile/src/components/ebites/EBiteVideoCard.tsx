import React, { useEffect, useRef, useState } from "react";
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
  patchCachedLike,
} from "../../api/engagementCache";
import ShareReelModal from "../../features/chat/components/ShareReelModal";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");

const WATCH_THRESHOLD_PERCENT = 80;

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
  const [shareVisible, setShareVisible] = useState(false);
  const hasReportedUnlock = useRef(false);
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const reelId = Number(item.id);

  useEffect(() => {
    if (!reelId || Number.isNaN(reelId)) return;
    const cached = getCachedEngagement(reelId);
    if (cached) {
      setLiked(cached.likedByMe);
      setLikeCount(cached.totalLikes);
      return;
    }
    engagementApi
      .getReelEngagement(reelId)
      .then((data) => {
        setLiked(data.likedByMe);
        setLikeCount(data.totalLikes);
        setCachedEngagement(reelId, data.likedByMe, data.totalLikes);
      })
      .catch(() => {});
  }, [reelId]);

  useEffect(() => {
    if (!videoRef.current) return;
    if (isActive && !isPausedByUser) {
      videoRef.current.playAsync();
    } else {
      videoRef.current.pauseAsync();
    }
  }, [isActive, isPausedByUser]);

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

  const toggleLike = async () => {
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
      setCachedEngagement(reelId, result.liked, result.totalLikes);
    } catch {
      setLiked(prevLiked);
      setLikeCount(prevCount);
      setCachedEngagement(reelId, prevLiked, prevCount);
    }
  };

  const progress =
    status && status.durationMillis
      ? (status.positionMillis / status.durationMillis) * 100
      : 0;

  return (
    <View style={styles.container}>
      <TouchableWithoutFeedback onPress={togglePlayPause}>
        <View style={styles.tapArea}>
          <Video
            ref={videoRef}
            source={{ uri: item.videoUrl }}
            style={styles.video}
            resizeMode={ResizeMode.COVER}
            isLooping
            onPlaybackStatusUpdate={handlePlaybackStatusUpdate}
            shouldPlay={isActive && !isPausedByUser}
          />

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

            {/* Progress Bar */}
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
          <Ionicons
            name={liked ? "heart" : "heart-outline"}
            size={30}
            color={liked ? "#FF3040" : "#FFF"}
          />
          {likeCount > 0 && (
            <Text style={styles.actionCount}>{likeCount}</Text>
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
        <ShareReelModal
          visible={shareVisible}
          strapiReelId={reelId}
          onClose={() => setShareVisible(false)}
          onSharedToChat={(target) => {
            navigation.navigate("Chat", target);
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT, // Snap size
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
    paddingBottom: 90, // space for tab bar
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
    bottom: 85, // just above the tab bar
    left: 20,
    right: 20,
  },
  progressBar: {
    height: "100%",
    backgroundColor: "#fff",
  },
});
