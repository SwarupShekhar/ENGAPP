import React, { useState, useRef, useCallback, useEffect } from "react";
import {
  View,
  FlatList,
  Dimensions,
  StyleSheet,
  StatusBar,
  ViewToken,
  ActivityIndicator,
  Text,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import EBiteVideoCard from "../components/ebites/EBiteVideoCard";
import EBiteActivityCard from "../components/ebites/EBiteActivityCard";
import { Ionicons } from "@expo/vector-icons";
import { reelsApi, Reel } from "../api/reels";
import AsyncStorage from "@react-native-async-storage/async-storage";
import FeedPrefetchService from "../services/feedPrefetchService";

const { height: SCREEN_HEIGHT, width: SCREEN_WIDTH } = Dimensions.get("window");

// ─── TYPES ──────────────────────────────────────────────────
type FeedItem = {
  id: string;
  type: "video" | "activity";
  data: any;
};

// ─── MAIN COMPONENT ─────────────────────────────────────────
export default function EBitesScreen() {
  const [activeIndex, setActiveIndex] = useState(0);
  const [isScreenFocused, setIsScreenFocused] = useState(true);
  const [feedItems, setFeedItems] = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const flatListRef = useRef<FlatList>(null);
  const baseFeedRef = useRef<FeedItem[]>([]); // Store original feed for looping

  const fetchFeed = useCallback(async () => {
    try {
      setActiveIndex(0);

      // ── Layer 1: In-memory cache (instant, ~0ms) ──
      const prefetchService = FeedPrefetchService.getInstance();
      let cached = prefetchService.getCachedFeed();
      let reels: Reel[] | null = null;

      if (cached && cached.items && cached.items.length > 0) {
        console.log("[eBites] Using in-memory prefetched feed (zero latency)");
        reels = cached.items;
      }

      // ── Layer 2: AsyncStorage (fast, ~10ms, survives restart) ──
      if (!reels) {
        try {
          const stored = await AsyncStorage.getItem("@ebites_feed_cache");
          if (stored) {
            const parsed = JSON.parse(stored);
            if (parsed.response?.items?.length > 0) {
              console.log("[eBites] Using AsyncStorage cached feed");
              reels = parsed.response.items;
            }
          }
        } catch (e) {
          console.warn("[eBites] AsyncStorage read failed:", e);
        }
      }

      // If we found cached data, render immediately
      if (reels && reels.length > 0) {
        buildAndSetFeed(reels);
        setLoading(false);

        // Background refresh: silently fetch latest data
        reelsApi
          .getFeed()
          .then((response) => {
            if (response.items && response.items.length > 0) {
              console.log("[eBites] Background refresh complete");
              buildAndSetFeed(response.items);
              // Update caches
              AsyncStorage.setItem(
                "@ebites_feed_cache",
                JSON.stringify({
                  response,
                  timestamp: Date.now(),
                }),
              );
            }
          })
          .catch(() => {
            /* silent */
          });
        return;
      }

      // ── Layer 3: API call (slow, last resort) ──
      setLoading(true);
      console.log("[eBites] Full cache miss, fetching from API...");
      const response = await reelsApi.getFeed();
      reels = response.items || [];
      buildAndSetFeed(reels);

      // Save to AsyncStorage for next time
      AsyncStorage.setItem(
        "@ebites_feed_cache",
        JSON.stringify({
          response,
          timestamp: Date.now(),
        }),
      );
    } catch (err) {
      console.error("Failed to load reels feed:", err);
      setError("Failed to load feed. Please try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  const buildAndSetFeed = useCallback((reels: Reel[]) => {
    const baseFeed: FeedItem[] = [];
    reels.forEach((reel) => {
      baseFeed.push({
        id: `video-${reel.id}`,
        type: "video",
        data: reel,
      });

      if (reel.activity) {
        baseFeed.push({
          id: `activity-${reel.id}`,
          type: "activity",
          data: {
            ...reel.activity,
            reelId: reel.id,
            topic_tag: reel.topic_tag,
            title: reel.activity.question,
            activityType: reel.activity.type,
          },
        });
      }
    });

    baseFeedRef.current = baseFeed;

    // Repeat the feed 10x for infinite-scroll feel
    const loopedFeed: FeedItem[] = [];
    for (let i = 0; i < 10; i++) {
      baseFeed.forEach((item) => {
        loopedFeed.push({ ...item, id: `${item.id}-loop${i}` });
      });
    }

    setFeedItems(loopedFeed);
    setError(null);
  }, []);

  useEffect(() => {
    fetchFeed();
  }, [fetchFeed]);

  useFocusEffect(
    useCallback(() => {
      setIsScreenFocused(true);
      return () => setIsScreenFocused(false);
    }, []),
  );

  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      if (viewableItems.length > 0) {
        setActiveIndex(viewableItems[0].index || 0);
      }
    },
  ).current;

  const viewabilityConfig = useRef({
    itemVisiblePercentThreshold: 50,
  }).current;

  const handleActivitySubmit = async (itemData: any, isCorrect: boolean) => {
    try {
      await reelsApi.submitActivityResult(
        itemData.reelId,
        isCorrect,
        itemData.topic_tag,
      );
    } catch (err) {
      console.error("Failed to submit activity result:", err);
    }
  };

  const renderItem = ({ item, index }: { item: FeedItem; index: number }) => {
    const isActive = isScreenFocused && activeIndex === index;

    if (item.type === "video") {
      return (
        <EBiteVideoCard
          item={{
            ...item.data,
            videoUrl: item.data.playback_url, // Map backend playback_url to component videoUrl
          }}
          isActive={isActive}
        />
      );
    } else if (item.type === "activity") {
      return (
        <EBiteActivityCard
          item={{
            ...item.data,
            correctAnswer: item.data.correct_answer, // Map backend correct_answer to component correctAnswer
          }}
          isActive={isActive}
          onComplete={(isCorrect) => handleActivitySubmit(item.data, isCorrect)}
        />
      );
    }
    return null;
  };

  if (loading && feedItems.length === 0) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color="#6366f1" />
        <Text style={styles.loadingText}>Loading eBites...</Text>
      </View>
    );
  }

  if (error && feedItems.length === 0) {
    return (
      <View style={[styles.container, styles.centered]}>
        <Text style={styles.errorText}>{error}</Text>
        <Text style={styles.retryText} onPress={fetchFeed}>
          Tap to Retry
        </Text>
      </View>
    );
  }

  if (!loading && feedItems.length === 0) {
    return (
      <View style={[styles.container, styles.centered]}>
        <Ionicons
          name="film-outline"
          size={64}
          color="#475569"
          style={{ marginBottom: 16 }}
        />
        <Text style={[styles.loadingText, { color: "#94a3b8" }]}>
          No eBites available yet
        </Text>
        <Text style={[styles.retryText, { marginTop: 8 }]} onPress={fetchFeed}>
          Refresh Feed
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />
      <FlatList
        ref={flatListRef}
        data={feedItems}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        pagingEnabled
        showsVerticalScrollIndicator={false}
        snapToInterval={SCREEN_HEIGHT}
        snapToAlignment="start"
        decelerationRate="fast"
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
        initialNumToRender={3}
        maxToRenderPerBatch={3}
        windowSize={5}
        removeClippedSubviews
        getItemLayout={(data, index) => ({
          length: SCREEN_HEIGHT,
          offset: SCREEN_HEIGHT * index,
          index,
        })}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000",
  },
  centered: {
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    color: "#fff",
    marginTop: 12,
    fontSize: 16,
  },
  errorText: {
    color: "#ef4444",
    fontSize: 16,
    textAlign: "center",
    paddingHorizontal: 40,
  },
  retryText: {
    color: "#6366f1",
    marginTop: 20,
    fontSize: 14,
    fontWeight: "bold",
  },
});
