import React, { useRef, useEffect, useState } from 'react';
import { View, Text, StyleSheet, Dimensions, TouchableWithoutFeedback } from 'react-native';
import { Video, ResizeMode, AVPlaybackStatus, AVPlaybackStatusSuccess } from 'expo-av';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

interface Props {
    item: any;
    isActive: boolean;
}

export default function EBiteVideoCard({ item, isActive }: Props) {
    const videoRef = useRef<Video>(null);
    const [status, setStatus] = useState<AVPlaybackStatusSuccess | null>(null);
    const [isPausedByUser, setIsPausedByUser] = useState(false);

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
        }
    };

    const togglePlayPause = () => {
        setIsPausedByUser(prev => !prev);
    };

    const progress = status && status.durationMillis
        ? (status.positionMillis / status.durationMillis) * 100
        : 0;

    return (
        <TouchableWithoutFeedback onPress={togglePlayPause}>
            <View style={styles.container}>
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
                    colors={['transparent', 'rgba(0,0,0,0.8)']}
                    style={styles.overlay}
                >
                    <View style={styles.bottomContent}>
                        <Text style={styles.title}>{item.title}</Text>
                        {item.description && (
                            <Text style={styles.description}>{item.description}</Text>
                        )}
                    </View>

                    {/* Progress Bar */}
                    <View style={styles.progressBarContainer}>
                        <View style={[styles.progressBar, { width: `${progress}%` }]} />
                    </View>
                </LinearGradient>
            </View>
        </TouchableWithoutFeedback>
    );
}

const styles = StyleSheet.create({
    container: {
        width: SCREEN_WIDTH,
        height: SCREEN_HEIGHT, // Snap size
        backgroundColor: '#000',
    },
    video: {
        width: '100%',
        height: '100%',
    },
    pauseOverlay: {
        ...StyleSheet.absoluteFillObject,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: 'rgba(0,0,0,0.2)',
    },
    overlay: {
        position: 'absolute',
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
        color: '#fff',
        fontSize: 22,
        fontWeight: 'bold',
        marginBottom: 8,
    },
    description: {
        color: '#rgba(255,255,255,0.8)',
        fontSize: 15,
        lineHeight: 22,
    },
    progressBarContainer: {
        height: 3,
        backgroundColor: 'rgba(255,255,255,0.3)',
        width: '100%',
        borderRadius: 2,
        overflow: 'hidden',
        position: 'absolute',
        bottom: 85, // just above the tab bar
        left: 20,
        right: 20,
    },
    progressBar: {
        height: '100%',
        backgroundColor: '#fff',
    },
});
