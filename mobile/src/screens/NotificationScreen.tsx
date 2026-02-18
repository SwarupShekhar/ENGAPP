import React, { useCallback, useState } from 'react';
import {
    View, Text, StyleSheet, FlatList, TouchableOpacity,
    ActivityIndicator, Image, Alert, RefreshControl
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { connectionsApi } from '../api/connections';
import { theme } from '../theme/theme';

interface FriendRequest {
    id: string;
    sender: {
        id: string;
        firstName?: string;
        fname?: string; // Backend might return this
        lastName?: string;
        lname?: string;
        imageUrl?: string;
    };
    createdAt: string;
}

export default function NotificationScreen() {
    const navigation = useNavigation();
    const [requests, setRequests] = useState<FriendRequest[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    const fetchRequests = async () => {
        try {
            const data = await connectionsApi.getPendingRequests();
            // Ensure data is array (API might return object with data property)
            setRequests(Array.isArray(data) ? data : []);
        } catch (error) {
            console.error('Failed to fetch requests:', error);
            // Alert.alert('Error', 'Could not load notifications');
        } finally {
            setLoading(false);
        }
    };

    useFocusEffect(
        useCallback(() => {
            fetchRequests();
        }, [])
    );

    const onRefresh = async () => {
        setRefreshing(true);
        await fetchRequests();
        setRefreshing(false);
    };

    const handleAccept = async (id: string, name: string) => {
        try {
            await connectionsApi.acceptRequest(id);
            Alert.alert('Success', `You are now friends with ${name}!`);
            setRequests(prev => prev.filter(r => r.id !== id));
        } catch (error: any) {
            console.error('Accept failed:', error);
            const msg = error?.response?.data?.message || error.message || 'Failed to request';
            Alert.alert('Error', msg);
        }
    };

    const handleDecline = async (id: string) => {
        try {
            await connectionsApi.rejectRequest(id);
            setRequests(prev => prev.filter(r => r.id !== id));
        } catch (error: any) {
            console.error('Decline failed:', error);
            const msg = error?.response?.data?.message || 'Failed to decline';
            Alert.alert('Error', msg);
        }
    };

    const renderItem = ({ item }: { item: FriendRequest }) => {
        const firstName = item.sender.firstName || item.sender.fname || 'User';
        const lastName = item.sender.lastName || item.sender.lname || '';
        const initial = firstName.charAt(0).toUpperCase();

        return (
            <View style={styles.card}>
                <View style={styles.cardHeader}>
                    <View style={styles.avatarContainer}>
                        {item.sender.imageUrl ? (
                            <Image source={{ uri: item.sender.imageUrl }} style={styles.avatarImage} />
                        ) : (
                            <Text style={styles.avatarText}>{initial}</Text>
                        )}
                    </View>
                    <View style={styles.textContainer}>
                        <Text style={styles.nameText}>
                            {firstName} {lastName}
                        </Text>
                        <Text style={styles.subtitleText}>Sent you a friend request</Text>
                        <Text style={styles.dateText}>{new Date(item.createdAt).toLocaleDateString()}</Text>
                    </View>
                </View>
                
                <View style={styles.actionRow}>
                    <TouchableOpacity 
                        style={[styles.btn, styles.declineBtn]} 
                        onPress={() => handleDecline(item.id)}
                    >
                        <Text style={[styles.btnText, styles.declineText]}>Decline</Text>
                    </TouchableOpacity>
                    <TouchableOpacity 
                        style={[styles.btn, styles.acceptBtn]} 
                        onPress={() => handleAccept(item.id, firstName)}
                    >
                        <Text style={[styles.btnText, styles.acceptText]}>Accept</Text>
                    </TouchableOpacity>
                </View>
            </View>
        );
    };

    return (
        <SafeAreaView style={styles.container}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
                    <Ionicons name="arrow-back" size={24} color={theme.colors.text.primary} />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Notifications</Text>
            </View>

            {loading ? (
                <View style={styles.center}>
                    <ActivityIndicator size="large" color={theme.colors.primary} />
                </View>
            ) : (
                <FlatList
                    data={requests}
                    renderItem={renderItem}
                    keyExtractor={item => item.id}
                    contentContainerStyle={styles.listContent}
                    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
                    ListEmptyComponent={
                        <View style={styles.emptyState}>
                            <Ionicons name="notifications-off-outline" size={48} color="#cbd5e1" />
                            <Text style={styles.emptyText}>No new notifications</Text>
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
        backgroundColor: '#F8F9FF',
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 12,
        backgroundColor: '#fff',
        borderBottomWidth: 1,
        borderBottomColor: '#f1f5f9',
    },
    backBtn: {
        padding: 8,
        marginRight: 8,
    },
    headerTitle: {
        fontSize: 18,
        fontWeight: '700',
        color: '#0f172a',
    },
    center: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    listContent: {
        padding: 16,
    },
    emptyState: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingTop: 60,
    },
    emptyText: {
        marginTop: 12,
        fontSize: 16,
        color: '#94a3b8',
        fontWeight: '500',
    },
    card: {
        backgroundColor: '#fff',
        borderRadius: 16,
        padding: 16,
        marginBottom: 12,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 8,
        elevation: 2,
    },
    cardHeader: {
        flexDirection: 'row',
        marginBottom: 16,
    },
    avatarContainer: {
        width: 48,
        height: 48,
        borderRadius: 24,
        backgroundColor: '#e0e7ff',
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 12,
        overflow: 'hidden',
    },
    avatarImage: {
        width: '100%',
        height: '100%',
    },
    avatarText: {
        fontSize: 20,
        fontWeight: '700',
        color: theme.colors.primary,
    },
    textContainer: {
        flex: 1,
        justifyContent: 'center',
    },
    nameText: {
        fontSize: 16,
        fontWeight: '700',
        color: '#0f172a',
        marginBottom: 2,
    },
    subtitleText: {
        fontSize: 14,
        color: '#64748b',
    },
    dateText: {
        fontSize: 12,
        color: '#94a3b8',
        marginTop: 4,
    },
    actionRow: {
        flexDirection: 'row',
        gap: 12,
    },
    btn: {
        flex: 1,
        paddingVertical: 10,
        borderRadius: 10,
        alignItems: 'center',
        justifyContent: 'center',
    },
    acceptBtn: {
        backgroundColor: theme.colors.primary,
    },
    declineBtn: {
        backgroundColor: '#f1f5f9',
    },
    btnText: {
        fontWeight: '600',
        fontSize: 14,
    },
    acceptText: {
        color: '#fff',
    },
    declineText: {
        color: '#64748b',
    },
});
