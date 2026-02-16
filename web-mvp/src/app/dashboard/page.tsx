"use client";

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Navbar } from '@/components/Navbar';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import api from '@/lib/api';
import { AssessmentSession } from '@/types';
import { RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, ResponsiveContainer } from 'recharts';
import { useAuth } from '@clerk/nextjs';
import { Loader2, CheckCircle2, Circle } from 'lucide-react';

export default function DashboardPage() {
    const { isLoaded, userId, getToken } = useAuth();
    const [data, setData] = useState<AssessmentSession | any>(null);
    const [sessions, setSessions] = useState<any[]>([]);
    const [tasks, setTasks] = useState<any[]>([]);
    const [loadingMessage, setLoadingMessage] = useState<string>("Initializing...");
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const fetchData = async () => {
            if (!isLoaded || !userId) return;

            setLoadingMessage("Authenticating...");
            try {
                const token = await getToken();
                setLoadingMessage("Fetching Data...");

                // Parallel fetch
                const [dashboardRes, sessionsRes, tasksRes] = await Promise.allSettled([
                    api.get('/assessment/dashboard', { headers: { Authorization: `Bearer ${token}` } }),
                    api.get('/sessions', { headers: { Authorization: `Bearer ${token}` } }),
                    api.get('/tasks/daily', { headers: { Authorization: `Bearer ${token}` } })
                ]);

                if (dashboardRes.status === 'fulfilled') {
                    setData(dashboardRes.value.data);
                } else {
                    console.error("Dashboard error:", dashboardRes.reason);
                }

                if (sessionsRes.status === 'fulfilled') {
                    setSessions(sessionsRes.value.data);
                }

                if (tasksRes.status === 'fulfilled') {
                    setTasks(tasksRes.value.data.tasks || []);
                }

            } catch (err: any) {
                console.error("Dashboard fetch error:", err);
                const msg = err.response?.data?.message || err.message || "Failed to load dashboard.";
                setError(msg);
            } finally {
                setLoadingMessage("");
            }
        };

        if (isLoaded && userId) {
            fetchData();
        }
    }, [isLoaded, userId, getToken]);

    const completeTask = async (taskId: string) => {
        try {
            const token = await getToken();
            await api.post(`/tasks/${taskId}/complete`, { score: 100 }, {
                headers: { Authorization: `Bearer ${token}` }
            });
            // Update local state
            setTasks(prev => prev.filter(t => t.id !== taskId));
        } catch (error) {
            console.error("Failed to complete task:", error);
        }
    };

    if (!isLoaded) return <div className="flex h-screen items-center justify-center">Loading Auth...</div>;
    if (!userId) return <div className="flex h-screen items-center justify-center">Please sign in</div>;

    if (loadingMessage) return (
        <div className="flex h-screen flex-col items-center justify-center gap-4">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-muted-foreground">{loadingMessage}</p>
        </div>
    );

    if (error) return (
        <div className="flex h-screen flex-col items-center justify-center gap-4">
            <div className="text-destructive font-bold">Error Loading Dashboard</div>
            <p className="text-muted-foreground">{error}</p>
            <Button onClick={() => window.location.reload()}>Retry</Button>
        </div>
    );

    const skillData = data?.skillBreakdown ? [
        { subject: 'Pronunciation', A: data.skillBreakdown.pronunciation.phonemeAccuracy, fullMark: 100 },
        { subject: 'Fluency', A: data.skillBreakdown.fluency.speechRate, fullMark: 100 },
        { subject: 'Grammar', A: data.skillBreakdown.grammar.tenseControl, fullMark: 100 },
        { subject: 'Vocab', A: data.skillBreakdown.vocabulary.lexicalRange, fullMark: 100 },
    ] : [];

    return (
        <div className="min-h-screen bg-background text-foreground">
            <Navbar />
            <main className="container py-8">
                <div className="mb-8 flex items-center justify-between">
                    <div>
                        <h1 className="text-3xl font-bold">Your Progress</h1>
                        <p className="text-muted-foreground pt-1">Current Level: <span className="text-primary font-bold text-xl">{data?.currentLevel || 'N/A'}</span></p>
                    </div>
                    <Button asChild size="lg">
                        <Link href="/assessment">Start Assessment</Link>
                    </Button>
                </div>

                <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                    {/* Overall Score Card */}
                    <Card>
                        <CardHeader>
                            <CardTitle>Overall Score</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="flex items-center justify-center py-6">
                                <div className="relative flex h-32 w-32 items-center justify-center rounded-full border-8 border-primary/20 text-4xl font-bold">
                                    {Math.round(data?.overallScore || 0)}
                                    <div className="absolute inset-0 rounded-full border-8 border-primary border-t-transparent"
                                        style={{ transform: `rotate(${((data?.overallScore || 0) / 100) * 360}deg)` }}></div>
                                </div>
                            </div>
                            <div className="text-center text-sm text-muted-foreground">
                                {data?.benchmark?.comparisonText || "Keep practicing!"}
                            </div>
                        </CardContent>
                    </Card>

                    {/* Benchmark Card */}
                    <Card>
                        <CardHeader>
                            <CardTitle>Performance Benchmark</CardTitle>
                            <CardDescription>Compared to {data?.currentLevel} learners</CardDescription>
                        </CardHeader>
                        <CardContent className="h-[200px]">
                            {data?.benchmark && (
                                <div className="space-y-4 pt-4">
                                    <div className="flex justify-between items-center bg-secondary p-3 rounded-lg">
                                        <span>Your Percentile</span>
                                        <span className="font-bold text-xl text-primary">Top {100 - data.benchmark.percentile}%</span>
                                    </div>
                                    <div className="flex justify-between items-center text-sm">
                                        <span>Average Score</span>
                                        <span className="font-semibold">{data.benchmark.averageScore}</span>
                                    </div>
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    {/* Skill Breakdown */}
                    <Card className="col-span-1 md:col-span-2 lg:col-span-1">
                        <CardHeader>
                            <CardTitle>Skill Breakdown</CardTitle>
                        </CardHeader>
                        <CardContent className="h-[250px] flex justify-center">
                            <ResponsiveContainer width="100%" height="100%">
                                <RadarChart cx="50%" cy="50%" outerRadius="80%" data={skillData}>
                                    <PolarGrid />
                                    <PolarAngleAxis dataKey="subject" />
                                    <PolarRadiusAxis />
                                    <Radar name="Skills" dataKey="A" stroke="#8884d8" fill="#8884d8" fillOpacity={0.6} />
                                </RadarChart>
                            </ResponsiveContainer>
                        </CardContent>
                    </Card>
                </div>

                <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 mt-6">
                    {/* Daily Tasks */}
                    <Card className="md:col-span-2 lg:col-span-1">
                        <CardHeader>
                            <CardTitle className="flex justify-between items-center">
                                Daily Tasks
                                <span className="text-xs font-normal text-muted-foreground">{tasks.length} pending</span>
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            {tasks.length > 0 ? (
                                <ul className="space-y-3">
                                    {tasks.map((task: any) => (
                                        <li key={task.id} className="flex items-start gap-3 p-3 rounded-lg border bg-secondary/30">
                                            <button
                                                onClick={() => completeTask(task.id)}
                                                className="mt-1 text-muted-foreground hover:text-primary transition-colors"
                                            >
                                                <Circle className="h-5 w-5" />
                                            </button>
                                            <div className="flex-1">
                                                <div className="font-medium text-sm">{task.title}</div>
                                                <div className="text-xs text-muted-foreground">{task.content?.instructions || 'Review your mistakes'}</div>
                                                <div className="mt-2 flex items-center gap-2">
                                                    <span className="text-[10px] bg-primary/10 text-primary px-2 py-0.5 rounded">{task.type.replace('_', ' ')}</span>
                                                    <span className="text-[10px] text-muted-foreground">{task.estimatedMinutes} mins</span>
                                                </div>
                                            </div>
                                        </li>
                                    ))}
                                </ul>
                            ) : (
                                <div className="flex flex-col items-center justify-center py-8 text-center">
                                    <CheckCircle2 className="h-10 w-10 text-green-500 mb-2" />
                                    <p className="text-sm font-medium">All caught up!</p>
                                    <p className="text-xs text-muted-foreground">Check back after your next practice call.</p>
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    {/* Personalized Plan */}
                    <Card>
                        <CardHeader>
                            <CardTitle>Personalized Plan</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <ul className="list-disc pl-5 space-y-2 text-sm">
                                {data?.personalizedPlan?.dailyFocus?.map((item: string, i: number) => (
                                    <li key={i}>{item}</li>
                                ))}
                            </ul>
                            <div className="mt-4 p-3 rounded bg-primary/5 border border-primary/10">
                                <p className="text-[10px] uppercase font-bold text-primary mb-1">Weekly Goal</p>
                                <p className="text-sm">{data?.personalizedPlan?.weeklyGoal || "Complete 3 practice calls"}</p>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Recent Sessions */}
                    <Card>
                        <CardHeader>
                            <CardTitle>Recent Sessions</CardTitle>
                        </CardHeader>
                        <CardContent>
                            {sessions.length > 0 ? (
                                <ul className="space-y-4">
                                    {sessions.slice(0, 5).map((session: any) => (
                                        <li key={session.id} className="flex items-center justify-between border-b pb-2 last:border-0 last:pb-0">
                                            <div>
                                                <div className="font-medium text-sm">{session.topic || 'Assessment'}</div>
                                                <div className="text-xs text-muted-foreground">{new Date(session.createdAt).toLocaleDateString()}</div>
                                            </div>
                                            <Button variant="outline" size="sm" asChild className="h-8 text-xs">
                                                <Link href={`/feedback/${session.id}`}>Feedback</Link>
                                            </Button>
                                        </li>
                                    ))}
                                </ul>
                            ) : (
                                <p className="text-muted-foreground text-sm">No recent sessions found.</p>
                            )}
                        </CardContent>
                    </Card>
                </div>
            </main>
        </div>
    );
}
