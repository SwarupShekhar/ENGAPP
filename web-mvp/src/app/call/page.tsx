"use client";

import { useEffect, useState } from 'react';
import { Navbar } from '@/components/Navbar';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useAuth } from '@clerk/nextjs';
import { LiveKitRoom, VideoConference, useTracks, LayoutContextProvider } from '@livekit/components-react';
import '@livekit/components-styles';
import { Track } from 'livekit-client';
import api from '@/lib/api';
import { Loader2, Phone, PhoneOff } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';

export default function CallPage() {
    const { isLoaded, userId, getToken } = useAuth();
    const [token, setToken] = useState("");
    const [sessionId, setSessionId] = useState("");
    const [isConnecting, setIsConnecting] = useState(false);
    const [isConnected, setIsConnected] = useState(false);

    const startCall = async () => {
        if (!userId) return;
        setIsConnecting(true);

        try {
            // Generate a random session ID for testing
            const newSessionId = uuidv4();
            setSessionId(newSessionId);

            const authToken = await getToken();

            // Request Token from Backend
            const res = await api.post('/livekit/token',
                { userId: userId, sessionId: newSessionId },
                { headers: { Authorization: `Bearer ${authToken}` } }
            );

            setToken(res.data.token);
            setIsConnected(true);
        } catch (error) {
            console.error("Failed to start call:", error);
            alert("Failed to connect to LiveKit. Check backend logs.");
        } finally {
            setIsConnecting(false);
        }
    };

    const endCall = () => {
        setIsConnected(false);
        setToken("");
        setSessionId("");
    };

    if (!isLoaded || !userId) return <div className="flex h-screen items-center justify-center">Loading...</div>;

    return (
        <div className="min-h-screen bg-background flex flex-col">
            <Navbar />
            <main className="flex-1 flex flex-col">
                {!isConnected ? (
                    <div className="flex-1 flex items-center justify-center p-4">
                        <Card className="w-full max-w-md text-center">
                            <CardContent className="pt-6 space-y-6">
                                <div className="h-24 w-24 bg-primary/10 rounded-full flex items-center justify-center mx-auto">
                                    <Phone className="h-12 w-12 text-primary" />
                                </div>
                                <div>
                                    <h1 className="text-2xl font-bold">Start Practice Call</h1>
                                    <p className="text-muted-foreground mt-2">
                                        Test the realtime audio/video connection.
                                        This will connect you to a LiveKit room.
                                    </p>
                                </div>
                                <Button size="lg" className="w-full" onClick={startCall} disabled={isConnecting}>
                                    {isConnecting ? (
                                        <>
                                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                            Connecting...
                                        </>
                                    ) : (
                                        "Join Room"
                                    )}
                                </Button>
                            </CardContent>
                        </Card>
                    </div>
                ) : (
                    <LiveKitRoom
                        video={false} // Audio only for now, user can toggle
                        audio={true}
                        token={token}
                        serverUrl={process.env.NEXT_PUBLIC_LIVEKIT_URL || "wss://engrapp-8lz8v8ia.livekit.cloud"} // Hardcoded fallback or env
                        data-lk-theme="default"
                        style={{ height: 'calc(100vh - 3.5rem)' }}
                        onDisconnected={endCall}
                    >
                        <VideoConference />
                    </LiveKitRoom>
                )}
            </main>
        </div>
    );
}
