"use client";

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Navbar } from '@/components/Navbar';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useAuth } from '@clerk/nextjs';
import api from '@/lib/api';
import { Loader2, Users, Search, Play } from 'lucide-react';

const TOPICS = ['General English', 'Travel & Culture', 'Technology & Innovation', 'Business & Work', 'Daily Life'];

export default function SocialPage() {
    const { isLoaded: authLoaded, userId, getToken } = useAuth();
    const router = useRouter();

    const [selectedTopic, setSelectedTopic] = useState('General English');
    const [isQueued, setIsQueued] = useState(false);
    const [matchData, setMatchData] = useState<any>(null);
    const [secondsInQueue, setSecondsInQueue] = useState(0);
    const [userLevel, setUserLevel] = useState('B1'); // Default fallback

    useEffect(() => {
        // Fetch user level on load
        const fetchUserLevel = async () => {
            if (!authLoaded || !userId) return;
            try {
                const token = await getToken();
                const res = await api.get('/auth/me', { headers: { Authorization: `Bearer ${token}` } });
                setUserLevel(res.data.data.level || 'B1');
            } catch (error) {
                console.error("Failed to fetch user level:", error);
            }
        };
        fetchUserLevel();
    }, [authLoaded, userId, getToken]);

    useEffect(() => {
        let interval: any;
        if (isQueued) {
            interval = setInterval(() => {
                setSecondsInQueue(prev => prev + 1);
                pollMatchStatus();
            }, 3000);
        } else {
            setSecondsInQueue(0);
        }
        return () => clearInterval(interval);
    }, [isQueued]);

    const pollMatchStatus = async () => {
        if (!userId) return;
        try {
            const token = await getToken();
            const res = await api.get(`/matchmaking/status?userId=${userId}&level=${userLevel}`, {
                headers: { Authorization: `Bearer ${token}` }
            });

            if (res.data.matched) {
                setMatchData(res.data);
                setIsQueued(false);
                // Auto redirect after a short delay to show match UI
                setTimeout(() => {
                    router.push(`/call?sessionId=${res.data.sessionId}&roomName=${res.data.roomName}&partnerName=${encodeURIComponent(res.data.partnerName)}`);
                }, 2000);
            } else if (res.data.message && res.data.message.includes('No partner found')) {
                // Timeout handled by backend
                setIsQueued(false);
                alert("Matchmaking timed out. No partner found. Please try again.");
            }
        } catch (error) {
            console.error("Polling error:", error);
        }
    };

    const joinQueue = async () => {
        if (!userId) return;
        try {
            const token = await getToken();
            await api.post('/matchmaking/join', {
                userId,
                englishLevel: userLevel,
                topic: selectedTopic
            }, {
                headers: { Authorization: `Bearer ${token}` }
            });
            setIsQueued(true);
            setMatchData(null);
        } catch (error) {
            console.error("Failed to join queue:", error);
            alert("Matchmaking error. Check if Redis is running on backend.");
        }
    };

    const cancelQueue = async () => {
        // Backend handles timeout, but we can stop polling
        setIsQueued(false);
    };

    if (!authLoaded) return <div className="flex h-screen items-center justify-center"><Loader2 className="animate-spin text-primary" /></div>;

    return (
        <div className="min-h-screen bg-background">
            <Navbar />
            <main className="container py-8 max-w-4xl">
                <div className="mb-8">
                    <h1 className="text-3xl font-bold flex items-center gap-2">
                        <Users className="text-primary" />
                        Social Practice
                    </h1>
                    <p className="text-muted-foreground mt-2">
                        Connect with co-learners at level <span className="text-primary font-bold">{userLevel}</span> for a 1-on-1 speaking session.
                    </p>
                </div>

                {!isQueued && !matchData ? (
                    <Card className="border-primary/20 shadow-lg">
                        <CardHeader>
                            <CardTitle>Start a Conversation</CardTitle>
                            <CardDescription>Select a topic and find a partner to practice with.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                {TOPICS.map(topic => (
                                    <Button
                                        key={topic}
                                        variant={selectedTopic === topic ? 'default' : 'outline'}
                                        onClick={() => setSelectedTopic(topic)}
                                        className="justify-start py-6 h-auto whitespace-normal text-left"
                                    >
                                        {topic}
                                    </Button>
                                ))}
                            </div>

                            <Button size="lg" className="w-full mt-4" onClick={joinQueue}>
                                <Search className="mr-2 h-5 w-5" />
                                Find a Partner
                            </Button>
                        </CardContent>
                    </Card>
                ) : isQueued ? (
                    <Card className="border-primary bg-primary/5 shadow-xl animate-pulse">
                        <CardContent className="flex flex-col items-center justify-center py-16 gap-6">
                            <div className="relative">
                                <Users className="h-16 w-16 text-primary" />
                                <Loader2 className="h-20 w-20 text-primary absolute -top-2 -left-2 animate-spin-slow opacity-20" />
                            </div>
                            <div className="text-center space-y-2">
                                <h3 className="text-2xl font-bold">Finding a Partner...</h3>
                                <p className="text-muted-foreground">Searching for {userLevel} learners interested in "{selectedTopic}"</p>
                                <p className="text-primary font-mono text-xl pt-4">{Math.floor(secondsInQueue / 60)}:{(secondsInQueue % 60).toString().padStart(2, '0')}</p>
                            </div>
                            <Button variant="ghost" onClick={cancelQueue}>Cancel Search</Button>
                        </CardContent>
                    </Card>
                ) : matchData ? (
                    <Card className="border-green-500 bg-green-50 dark:bg-green-950/10 shadow-xl border-2">
                        <CardContent className="flex flex-col items-center justify-center py-16 gap-6">
                            <div className="h-24 w-24 rounded-full bg-green-500 flex items-center justify-center text-white shadow-lg shadow-green-500/50">
                                <Play className="h-12 w-12 fill-current" />
                            </div>
                            <div className="text-center space-y-2">
                                <h3 className="text-2xl font-bold text-green-600">Match Found!</h3>
                                <p className="text-lg">You are matched with <span className="font-bold underline">{matchData.partnerName}</span></p>
                                <p className="text-muted-foreground">Redirecting to call room...</p>
                            </div>
                        </CardContent>
                    </Card>
                ) : null}

                <div className="mt-12 grid grid-cols-1 md:grid-cols-2 gap-6">
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-sm font-medium">Why Practice with Peers?</CardTitle>
                        </CardHeader>
                        <CardContent className="text-sm text-muted-foreground">
                            Speaking with other learners helps reduce anxiety and builds confidence in real-world scenarios. Our matching algorithm connects you with people at a similar CEFR level.
                        </CardContent>
                    </Card>
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-sm font-medium">Safety & Privacy</CardTitle>
                        </CardHeader>
                        <CardContent className="text-sm text-muted-foreground">
                            Ensure you follow our community guidelines. You can block or report users after the call to avoid being matched with them again.
                        </CardContent>
                    </Card>
                </div>
            </main>
        </div>
    );
}
