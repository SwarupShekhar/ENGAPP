import React, { useState, useCallback } from 'react';
import {
    View, Text, FlatList, TouchableOpacity,
    StyleSheet, SafeAreaView, ActivityIndicator,
    Image, RefreshControl
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { chatApi } from '../api/connections';
import { theme } from '../theme/theme';

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
}

export default function ConversationsScreen() {
    const navigation = useNavigation();
    const [conversations, setConversations] = useState<Conversation[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    const fetchConversations = async () => {
        try {
            const data = await chatApi.getConversations();
            setConversations(data);
        } catch (error) {
            console.error('[ConversationsScreen] Fetch error:', error);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    useFocusEffect(
        useCallback(() => {
            fetchConversations();
        }, [])
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
            return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        } else if (days === 1) {
            return 'Yesterday';
        } else if (days < 7) {
            return date.toLocaleDateString([], { weekday: 'short' });
        } else {
            return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
        }
    };

    const renderItem = ({ item }: { item: Conversation }) => (
        <TouchableOpacity
            style={styles.conversationItem}
            onPress={() => (navigation as any).navigate('Chat', {
                conversationId: item.conversationId,
                partnerId: item.partner?.id,
                partnerName: item.partner?.name,
                partnerAvatar: item.partner?.profileImage
            })}
        >
            <View style={styles.avatarContainer}>
                {item.partner?.profileImage ? (
                    <Image source={{ uri: item.partner.profileImage }} style={styles.avatar} />
                ) : (
                    <View style={styles.avatarPlaceholder}>
                        <Text style={styles.avatarInitial}>
                            {item.partner?.name.charAt(0).toUpperCase() || '?'}
                        </Text>
                    </View>
                )}
            </View>

            <View style={styles.contentContainer}>
                <View style={styles.headerRow}>
                    <Text style={styles.partnerName} numberOfLines={1}>
                        {item.partner?.name || 'Unknown User'}
                    </Text>
                    <Text style={styles.timeText}>
                        {item.lastMessage ? formatTime(item.lastMessage.createdAt) : formatTime(item.lastActivityAt)}
                    </Text>
                </View>

                <Text style={styles.lastMessage} numberOfLines={1}>
                    {item.lastMessage
                        ? (item.lastMessage.type === 'call_invite' ? '📞 Voice Call' : item.lastMessage.content)
                        : 'No messages yet'}
                </Text>
            </View>
            
            <Ionicons name="chevron-forward" size={16} color="#4B5563" />
        </TouchableOpacity>
    );

    return (
        <SafeAreaView style={styles.container}>
            <View style={styles.header}>
                <TouchableOpacity
                    style={styles.backButton}
                    onPress={() => navigation.goBack()}
                >
                    <Ionicons name="chevron-back" size={24} color="#FFF" />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Messages</Text>
                <View style={styles.headerRight} />
            </View>

            {loading ? (
                <View style={styles.centerContainer}>
                    <ActivityIndicator size="large" color="#4F46E5" />
                </View>
            ) : (
                <FlatList
                    data={conversations}
                    renderItem={renderItem}
                    keyExtractor={item => item.conversationId}
                    contentContainerStyle={styles.listContainer}
                    refreshControl={
                        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#4F46E5" />
                    }
                    ListEmptyComponent={
                        <View style={styles.emptyContainer}>
                            <Ionicons name="chatbubbles-outline" size={64} color="#9CA3AF" />
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

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#F9FAFB',
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 12,
        backgroundColor: '#4F46E5',
    },
    backButton: {
        padding: 4,
    },
    headerTitle: {
        flex: 1,
        textAlign: 'center',
        fontSize: 18,
        fontWeight: '700',
        color: '#FFF',
    },
    headerRight: {
        width: 32,
    },
    centerContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    listContainer: {
        flexGrow: 1,
    },
    conversationItem: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 16,
        backgroundColor: '#FFF',
        borderBottomWidth: 1,
        borderBottomColor: '#F3F4F6',
    },
    avatarContainer: {
        marginRight: 12,
    },
    avatar: {
        width: 50,
        height: 50,
        borderRadius: 25,
    },
    avatarPlaceholder: {
        width: 50,
        height: 50,
        borderRadius: 25,
        backgroundColor: '#E5E7EB',
        justifyContent: 'center',
        alignItems: 'center',
    },
    avatarInitial: {
        fontSize: 20,
        fontWeight: '600',
        color: '#6B7280',
    },
    contentContainer: {
        flex: 1,
        marginRight: 8,
    },
    headerRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 4,
    },
    partnerName: {
        fontSize: 16,
        fontWeight: '600',
        color: '#111827',
        flex: 1,
    },
    timeText: {
        fontSize: 12,
        color: '#6B7280',
    },
    lastMessage: {
        fontSize: 14,
        color: '#4B5563',
    },
    emptyContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 32,
        paddingTop: 100,
    },
    emptyTitle: {
        fontSize: 18,
        fontWeight: '700',
        color: '#374151',
        marginTop: 16,
    },
    emptySubtitle: {
        fontSize: 14,
        color: '#6B7280',
        textAlign: 'center',
        marginTop: 8,
    },
});
