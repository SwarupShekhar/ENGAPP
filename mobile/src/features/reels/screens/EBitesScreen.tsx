import React, { useState, useRef, useCallback, useEffect } from "react";
import {
  View,
  FlatList,
  Dimensions,
  StyleSheet,
  StatusBar,
  ViewToken,
  Text,
  RefreshControl,
  Alert,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import EBiteVideoCard from "../../../components/ebites/EBiteVideoCard";
import EBiteActivityCard from "../../../components/ebites/EBiteActivityCard";
import { reelsApi, Reel } from "../../../api/reels";
import AsyncStorage from "@react-native-async-storage/async-storage";
import FeedPrefetchService from "../../../services/feedPrefetchService";
import { EBITES_FEED_CACHE_KEY } from "../../../services/cacheKeys";
import { EmptyState } from "../../../components/common/EmptyState";
import { Skeleton } from "../../../components/common/Skeleton";

const { height: SCREEN_HEIGHT } = Dimensions.get("window");

const UNLOCKED_REELS_KEY = "@ebites_unlocked_reels";

async function loadUnlockedReelIds(): Promise<Set<string>> {
  try {
    const stored = await AsyncStorage.getItem(UNLOCKED_REELS_KEY);
    const ids: string[] = stored ? JSON.parse(stored) : [];
    return new Set(ids);
  } catch {
    return new Set();
  }
}

type FeedItem = {
  id: string;
  type: "video" | "activity";
  data: any;
};

export default function EBitesScreen() {
  const [activeIndex, setActiveIndex] = useState(0);
  const [isScreenFocused, setIsScreenFocused] = useState(true);
  const [feedItems, setFeedItems] = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unlockedReelIds, setUnlockedReelIds] = useState<Set<string>>(new Set());

  const flatListRef = useRef<FlatList>(null);
  const reelsRef = useRef<Reel[]>([]);
  const hasFeedItemsRef = useRef(false);

  const buildAndSetFeed = useCallback(
    (reels: Reel[], unlockedIds: Set<string>) => {
      reelsRef.current = reels;
      const baseFeed: FeedItem[] = [];
      reels.forEach((reel) => {
        baseFeed.push({
          id: `video-${reel.id}`,
          type: "video",
          data: reel,
        });
        if (reel.activity && unlockedIds.has(String(reel.id))) {
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

      const loopedFeed: FeedItem[] = [];
      for (let i = 0; i < 10; i++) {
        baseFeed.forEach((item) => {
          loopedFeed.push({ ...item, id: `${item.id}-loop${i}` });
        });
      }

      setFeedItems(loopedFeed);
      hasFeedItemsRef.current = loopedFeed.length > 0;
      setError(null);
    },
    [],
  );

  const persistFeedCache = useCallback(async (response: { items?: Reel[] }) => {
    try {
      await AsyncStorage.setItem(
        EBITES_FEED_CACHE_KEY,
        JSON.stringify({
          response,
          timestamp: Date.now(),
        }),
      );
    } catch (e) {
      console.warn("[eBites] AsyncStorage write failed:", e);
    }
  }, []);

  const fetchFeed = useCallback(
    async (options?: { forceFresh?: boolean }) => {
      const forceFresh = options?.forceFresh === true;
      const prefetchService = FeedPrefetchService.getInstance();

      try {
        if (forceFresh) {
          setActiveIndex(0);
          prefetchService.invalidate();
        }

        let reels: Reel[] | null = null;

        if (!forceFresh) {
          const cached = prefetchService.getCachedFeed();
          if (cached?.items?.length) {
            console.log("[eBites] Using in-memory prefetched feed");
            reels = cached.items;
          }

          if (!reels) {
            try {
              const stored = await AsyncStorage.getItem(EBITES_FEED_CACHE_KEY);
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

          if (reels && reels.length > 0) {
            const unlocked = await loadUnlockedReelIds();
            setUnlockedReelIds(unlocked);
            buildAndSetFeed(reels, unlocked);
            setLoading(false);

            reelsApi
              .getFeed()
              .then(async (response) => {
                if (response.items?.length) {
                  const unlocked = await loadUnlockedReelIds();
                  setUnlockedReelIds(unlocked);
                  buildAndSetFeed(response.items, unlocked);
                  await persistFeedCache(response);
                }
              })
              .catch(() => {
                /* silent background refresh */
              });
            return;
          }
        }

        if (!forceFresh) {
          setLoading(true);
        }

        console.log(
          forceFresh
            ? "[eBites] Force refresh from API..."
            : "[eBites] Full cache miss, fetching from API...",
        );
        const response = await reelsApi.getFeed();
        reels = response.items || [];
        const unlocked = await loadUnlockedReelIds();
        setUnlockedReelIds(unlocked);
        buildAndSetFeed(reels, unlocked);
        await persistFeedCache(response);
        void prefetchService.prefetch();
      } catch (err) {
        console.error("Failed to load reels feed:", err);
        if (forceFresh && hasFeedItemsRef.current) {
          Alert.alert(
            "Refresh failed",
            "Could not update the feed. Showing your last loaded eBites.",
          );
        } else {
          setError("Failed to load feed. Please try again.");
        }
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [buildAndSetFeed, persistFeedCache],
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    void fetchFeed({ forceFresh: true });
  }, [fetchFeed]);

  const handleWatchProgress = useCallback(
    async (reelId: string, _progressPercent: number) => {
      setUnlockedReelIds((prev) => {
        const next = new Set(prev);
        next.add(reelId);
        AsyncStorage.setItem(
          UNLOCKED_REELS_KEY,
          JSON.stringify([...next]),
        ).catch(() => {});
        buildAndSetFeed(reelsRef.current, next);
        return next;
      });
    },
    [buildAndSetFeed],
  );

  useEffect(() => {
    void fetchFeed();
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
            videoUrl: item.data.playback_url,
          }}
          isActive={isActive}
          onWatchProgress={handleWatchProgress}
        />
      );
    }

    if (item.type === "activity") {
      return (
        <EBiteActivityCard
          item={{
            ...item.data,
            correctAnswer: item.data.correct_answer,
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
      <View style={styles.container}>
        <StatusBar barStyle="light-content" />
        <View style={styles.skeletonCaption}>
          <Skeleton dark width={120} height={14} />
          <Skeleton dark width={"80%"} height={12} style={{ marginTop: 10 }} />
          <Skeleton dark width={"60%"} height={12} style={{ marginTop: 8 }} />
        </View>
        <View style={styles.skeletonRail}>
          <Skeleton dark circle width={44} />
          <Skeleton dark circle width={44} style={{ marginTop: 20 }} />
          <Skeleton dark circle width={44} style={{ marginTop: 20 }} />
        </View>
      </View>
    );
  }

  if (error && feedItems.length === 0) {
    return (
      <View style={[styles.container, styles.centered]}>
        <EmptyState
          dark
          icon="📡"
          title="Couldn't load eBites"
          subtitle="Check your connection and try again."
          ctaLabel="Tap to Retry"
          onCtaPress={() => void fetchFeed({ forceFresh: true })}
        />
      </View>
    );
  }

  if (!loading && feedItems.length === 0) {
    return (
      <View style={[styles.container, styles.centered]}>
        <EmptyState
          dark
          icon="🎬"
          title="No eBites yet"
          subtitle="Short learning videos picked for your weak areas will appear here. Check back after your next practice."
          ctaLabel="Refresh Feed"
          onCtaPress={() => void fetchFeed({ forceFresh: true })}
        />
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
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#fff"
            colors={["#6366f1"]}
            progressBackgroundColor="#1a1a1a"
          />
        }
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
  skeletonCaption: {
    position: "absolute",
    left: 16,
    right: 90,
    bottom: 110,
  },
  skeletonRail: {
    position: "absolute",
    right: 16,
    bottom: 130,
    alignItems: "center",
  },
});
