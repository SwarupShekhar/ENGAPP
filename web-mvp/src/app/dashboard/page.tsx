"use client";

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Navbar } from '@/components/Navbar';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import api from '@/lib/api';
import { AssessmentSession } from '@/types';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar } from 'recharts';

export default function DashboardPage() {
    const [data, setData] = useState<AssessmentSession | any>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchDashboard = async () => {
            const userId = localStorage.getItem('userId');
            if (!userId) return; // Handle redirect if needed

            try {
                // In a real app we'd use a comprehensive hook or state manager
                // For MVP, we pass userId via header or query if auth middleware isn't set up for "dev-token"
                // But our backend expects Clerk. 
                // We might need to bypass auth or assume the user has a valid Clerk token.
                // Since the user asked for a Web MVP to test functionalities, I assume we will mock the auth 
                // or the user will put a real token.
                // For now, let's assume we can hit the endpoint.
                // If backend requires Clerk, we might need a "mock-user-id" header if I modified the guard, 
                // but checking the code, it uses ClerkGuard.
                // If this is blocked, I'll need to disable ClerkGuard for testing or add a simpler Guard.
                // I will add a 'x-user-id' header support in backend later if needed.
                // For now, I'll try to use the dashboard endpoint.

                // Correction: The backend expects `req.user.id`.
                // I'll assume we can't easily get a Clerk token without the full Clerk flow.
                // I should probably edit the backend to allow a "Dev Bypass" guard.

                const res = await api.get('/assessment/dashboard', {
                    headers: { 'x-user-id': userId } // I will add this support to backend
                });
                setData(res.data);
            } catch (err) {
                console.error(err);
            } finally {
                setLoading(false);
            }
        };

        fetchDashboard();
    }, []);

    if (loading) return <div className="flex h-screen items-center justify-center">Loading...</div>;

    const skillData = data?.skillBreakdown ? [
        { subject: 'Pronunciation', A: data.skillBreakdown.pronunciation.phonemeAccuracy, fullMark: 100 },
        { subject: 'Fluency', A: data.skillBreakdown.fluency.speechRate, fullMark: 100 }, // Scaling might be needed
        { subject: 'Grammar', A: data.skillBreakdown.grammar.tenseControl, fullMark: 100 },
        { subject: 'Vocab', A: data.skillBreakdown.vocabulary.lexicalRange, fullMark: 100 },
    ] : [];

    return (
        <div className="min-h-screen bg-background">
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

                    {/* Weakness Map */}
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

                {/* Detailed Feedback & Plan */}
                <div className="grid gap-6 md:grid-cols-2 mt-6">
                    <Card>
                        <CardHeader>
                            <CardTitle>Personalized Plan</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <ul className="list-disc pl-5 space-y-2">
                                {data?.personalizedPlan?.dailyFocus?.map((item: string, i: number) => (
                                    <li key={i}>{item}</li>
                                ))}
                            </ul>
                            <p className="mt-4 font-semibold text-sm">Weekly Goal: {data?.personalizedPlan?.weeklyGoal}</p>
                        </CardContent>
                    </Card>
                </div>
            </main>
        </div>
    );
}
