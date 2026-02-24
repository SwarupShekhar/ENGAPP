import React, { useState, useRef, useCallback, useEffect } from 'react';
import { View, FlatList, Dimensions, StyleSheet, StatusBar, ViewToken, ActivityIndicator, Text } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import EBiteVideoCard from '../components/ebites/EBiteVideoCard';
import EBiteActivityCard from '../components/ebites/EBiteActivityCard';
import { Ionicons } from '@expo/vector-icons';
import { reelsApi, Reel } from '../api/reels';

const { height: SCREEN_HEIGHT, width: SCREEN_WIDTH } = Dimensions.get('window');

// ─── TYPES ──────────────────────────────────────────────────
type FeedItem = {
    id: string;
    type: 'video' | 'activity';
    data: any;
};

// ─── MAIN COMPONENT ─────────────────────────────────────────
export default function EBitesScreen() {
    const [activeIndex, setActiveIndex] = useState(0);
    const [isScreenFocused, setIsScreenFocused] = useState(true);
    const [feedItems, setFeedItems] = useState<FeedItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchFeed = useCallback(async () => {
        try {
            setLoading(true);
            const reels = await reelsApi.getFeed();
            
            // Logic: Every 3 reels, we inject the activity of the 3rd reel if it exists.
            const mixedFeed: FeedItem[] = [];
            reels.forEach((reel, index) => {
                mixedFeed.push({
                    id: `video-${reel.id}`,
                    type: 'video',
                    data: reel
                });

                // Activity Injection Logic: For each reel, if it has a question, attach it right after.
                // This makes eBites feel like interactive capsules: "Watch -> Learn -> Test"
                if (reel.activity) {
                    mixedFeed.push({
                        id: `activity-${reel.id}`,
                        type: 'activity',
                        data: {
                            ...reel.activity,
                            reelId: reel.id, // Ensure reelId is passed for submission
                            topic_tag: reel.topic_tag, // Include topic_tag for score updates
                            title: reel.activity.question, // Map backend 'question' to component 'title'
                            activityType: reel.activity.type // Map backend 'type' to component 'activityType'
                        }
                    });
                }
            });

            setFeedItems(mixedFeed);
            setError(null);
        } catch (err) {
            console.error('Failed to load reels feed:', err);
            setError('Failed to load feed. Please try again.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchFeed();
    }, [fetchFeed]);

    useFocusEffect(
        useCallback(() => {
            setIsScreenFocused(true);
            return () => setIsScreenFocused(false);
        }, [])
    );

    const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
        if (viewableItems.length > 0) {
            setActiveIndex(viewableItems[0].index || 0);
        }
    }).current;

    const viewabilityConfig = useRef({
        itemVisiblePercentThreshold: 50,
    }).current;

    const handleActivitySubmit = async (itemData: any, isCorrect: boolean) => {
        try {
            await reelsApi.submitActivityResult(
                itemData.reelId,
                isCorrect,
                itemData.topic_tag
            );
        } catch (err) {
            console.error('Failed to submit activity result:', err);
        }
    };

    const renderItem = ({ item, index }: { item: FeedItem, index: number }) => {
        const isActive = isScreenFocused && activeIndex === index;

        if (item.type === 'video') {
            return <EBiteVideoCard 
                item={{
                    ...item.data,
                    videoUrl: item.data.playback_url // Map backend playback_url to component videoUrl
                }} 
                isActive={isActive} 
            />;
        } else if (item.type === 'activity') {
            return <EBiteActivityCard 
                item={{
                    ...item.data,
                    correctAnswer: item.data.correct_answer // Map backend correct_answer to component correctAnswer
                }} 
                isActive={isActive} 
                onComplete={(isCorrect) => handleActivitySubmit(item.data, isCorrect)}
            />;
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
                <Text style={styles.retryText} onPress={fetchFeed}>Tap to Retry</Text>
            </View>
        );
    }

    if (!loading && feedItems.length === 0) {
        return (
            <View style={[styles.container, styles.centered]}>
                <Ionicons name="film-outline" size={64} color="#475569" style={{ marginBottom: 16 }} />
                <Text style={[styles.loadingText, { color: '#94a3b8' }]}>You're all caught up!</Text>
                <Text style={[styles.retryText, { marginTop: 8 }]} onPress={fetchFeed}>Refresh Feed</Text>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <StatusBar barStyle="light-content" />
            <FlatList
                data={feedItems}
                renderItem={renderItem}
                keyExtractor={item => item.id}
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
                onRefresh={fetchFeed}
                refreshing={loading}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#000',
    },
    centered: {
        justifyContent: 'center',
        alignItems: 'center',
    },
    loadingText: {
        color: '#fff',
        marginTop: 12,
        fontSize: 16,
    },
    errorText: {
        color: '#ef4444',
        fontSize: 16,
        textAlign: 'center',
        paddingHorizontal: 40,
    },
    retryText: {
        color: '#6366f1',
        marginTop: 20,
        fontSize: 14,
        fontWeight: 'bold',
    },
});
