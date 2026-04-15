"use client";

import { useEffect, useState, useRef, Suspense } from 'react';
import { Navbar } from '@/components/Navbar';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useAuth } from '@clerk/nextjs';
import {
    LiveKitRoom,
    VideoConference,
    useLocalParticipant
} from '@livekit/components-react';
import '@livekit/components-styles';
import api from '@/lib/api';
import { Loader2, Phone, BarChart3 } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { useRouter, useSearchParams } from 'next/navigation';

export default function CallPage() {
    return (
        <Suspense fallback={<div className="flex h-screen items-center justify-center"><Loader2 className="animate-spin" /></div>}>
            <CallContent />
        </Suspense>
    );
}

function CallContent() {
    const { isLoaded, userId, getToken } = useAuth();
    const router = useRouter();
    const searchParams = useSearchParams();

    const [token, setToken] = useState("");
    const [sessionId, setSessionId] = useState(searchParams.get('sessionId') || "");
    const [roomName, setRoomName] = useState(searchParams.get('roomName') || "");
    const [isConnecting, setIsConnecting] = useState(false);
    const [isConnected, setIsConnected] = useState(false);

    const startCall = async () => {
        if (!userId) return;
        setIsConnecting(true);

        try {
            const sid = sessionId || uuidv4();
            setSessionId(sid);

            const authToken = await getToken();

            const res = await api.post('/livekit/token',
                { userId: userId, sessionId: sid },
                { headers: { Authorization: `Bearer ${authToken}` } }
            );

            setToken(res.data.token);
            setRoomName(res.data.roomName);
            setIsConnected(true);
        } catch (error) {
            console.error("Failed to start call:", error);
            alert("Failed to connect to LiveKit. Check backend logs.");
        } finally {
            setIsConnecting(false);
        }
    };

    const handleDisconnected = () => {
        setIsConnected(false);
        setToken("");
    };

    if (!isLoaded || !userId) return <div className="flex h-screen items-center justify-center"><Loader2 className="animate-spin" /></div>;

    return (
        <div className="min-h-screen bg-background flex flex-col">
            <Navbar />
            <main className="flex-1 flex flex-col">
                {!isConnected ? (
                    <div className="flex-1 flex items-center justify-center p-4">
                        <Card className="w-full max-w-md text-center shadow-xl border-primary/20">
                            <CardContent className="pt-8 space-y-6">
                                <div className="h-24 w-24 bg-primary/10 rounded-full flex items-center justify-center mx-auto animate-pulse">
                                    <Phone className="h-12 w-12 text-primary" />
                                </div>
                                <div>
                                    <h1 className="text-3xl font-bold">Practice Call</h1>
                                    <p className="text-muted-foreground mt-2">
                                        {searchParams.get('partnerName') ?
                                            `Connecting you with ${searchParams.get('partnerName')}...` :
                                            "Ready for a practice session?"}
                                    </p>
                                </div>
                                <Button size="lg" className="w-full py-6 text-lg" onClick={startCall} disabled={isConnecting}>
                                    {isConnecting ? (
                                        <>
                                            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                                            Initializing...
                                        </>
                                    ) : (
                                        "Join Room"
                                    )}
                                </Button>
                                {sessionId && (
                                    <p className="text-[10px] text-muted-foreground font-mono">Session: {sessionId}</p>
                                )}
                            </CardContent>
                        </Card>
                    </div>
                ) : (
                    <LiveKitRoom
                        video={false}
                        audio={true}
                        token={token}
                        serverUrl={process.env.NEXT_PUBLIC_LIVEKIT_URL || "wss://engrapp-8lz8v8ia.livekit.cloud"}
                        data-lk-theme="default"
                        style={{ height: 'calc(100vh - 3.5rem)' }}
                        onDisconnected={handleDisconnected}
                    >
                        <div className="flex-1 flex flex-col relative">
                            <VideoConference />
                            <CallRecorder
                                sessionId={sessionId}
                                userId={userId}
                                getToken={getToken}
                                onAnalysisStarted={() => router.push(`/feedback/${sessionId}`)}
                            />
                        </div>
                    </LiveKitRoom>
                )}
            </main>
        </div>
    );
}

function CallRecorder({ sessionId, userId, getToken, onAnalysisStarted }: { sessionId: string, userId: string, getToken: any, onAnalysisStarted: () => void }) {
    const { localParticipant } = useLocalParticipant();
    const [isRecording, setIsRecording] = useState(false);
    const [isUploading, setIsUploading] = useState(false);
    const mediaRecorder = useRef<MediaRecorder | null>(null);
    const audioChunks = useRef<Blob[]>([]);

    useEffect(() => {
        if (localParticipant && !isRecording && !isUploading) {
            startRecording();
        }
        return () => stopRecording();
    }, [localParticipant]);

    const startRecording = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const recorder = new MediaRecorder(stream);

            recorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    audioChunks.current.push(event.data);
                }
            };

            recorder.start(1000);
            mediaRecorder.current = recorder;
            setIsRecording(true);
        } catch (error) {
            console.error("Failed to start recording:", error);
        }
    };

    const stopRecording = () => {
        if (mediaRecorder.current && mediaRecorder.current.state !== 'inactive') {
            mediaRecorder.current.stop();
            setIsRecording(false);
        }
    };

    const handleFinalize = async () => {
        stopRecording();
        setIsUploading(true);

        try {
            const audioBlob = new Blob(audioChunks.current, { type: 'audio/wav' });

            const reader = new FileReader();
            reader.readAsDataURL(audioBlob);
            reader.onloadend = async () => {
                const base64Audio = (reader.result as string).split(',')[1];
                const authToken = await getToken();

                const uploadRes = await api.post('/sessions/upload-audio', {
                    audioBase64: base64Audio,
                    userId,
                    sessionId
                }, { headers: { Authorization: `Bearer ${authToken}` } });

                const audioUrl = uploadRes.data.audioUrl;

                await api.post(`/sessions/${sessionId}/participant/${userId}/audio`, {
                    audioUrl
                }, { headers: { Authorization: `Bearer ${authToken}` } });

                await api.post(`/sessions/${sessionId}/end`, {
                    actualDuration: Math.round(audioBlob.size / 16000),
                    userEndedEarly: false,
                    audioUrls: { [userId]: audioUrl }
                }, { headers: { Authorization: `Bearer ${authToken}` } });

                onAnalysisStarted();
            };
        } catch (error) {
            console.error("Failed to finalize session:", error);
            alert("Analysis failed to start.");
        } finally {
            setIsUploading(false);
        }
    };

    return (
        <div className="absolute bottom-6 right-6">
            <Button
                variant={isUploading ? "secondary" : "default"}
                size="lg"
                className="shadow-2xl gap-2 font-bold px-8 h-14 rounded-full border-4 border-white dark:border-zinc-900"
                onClick={handleFinalize}
                disabled={isUploading}
            >
                {isUploading ? (
                    <>
                        <Loader2 className="h-5 w-5 animate-spin" />
                        Analyzing...
                    </>
                ) : (
                    <>
                        <BarChart3 className="h-5 w-5" />
                        End & See Granular Feedback
                    </>
                )}
            </Button>
        </div>
    );
}
