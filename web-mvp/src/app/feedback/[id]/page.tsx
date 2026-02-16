"use client";

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Navbar } from '@/components/Navbar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@clerk/nextjs';
import api from '@/lib/api';
import { Loader2, CheckCircle, XCircle } from 'lucide-react';

export default function FeedbackPage() {
    const { id } = useParams();
    const { isLoaded, userId, getToken } = useAuth();
    const [analysis, setAnalysis] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const fetchAnalysis = async () => {
            if (!isLoaded || !userId || !id) return;

            try {
                const token = await getToken();
                const res = await api.get(`/sessions/${id}/analysis`, {
                    headers: { Authorization: `Bearer ${token}` }
                });
                setAnalysis(res.data);
            } catch (err: any) {
                console.error("Failed to fetch feedback:", err);
                setError(err.response?.data?.message || "Could not load feedback.");
            } finally {
                setLoading(false);
            }
        };

        fetchAnalysis();
    }, [isLoaded, userId, id, getToken]);

    if (!isLoaded || loading) return <div className="flex h-screen items-center justify-center"><Loader2 className="animate-spin" /></div>;
    if (error) return <div className="flex h-screen items-center justify-center text-destructive">{error}</div>;

    // Helper to safety check nested data
    const myAnalysis = analysis?.participants?.find((p: any) => p.userId === userId) || analysis?.analyses?.find((a: any) => a.participant?.userId === userId);

    // Fallback if structure varies
    const scores = myAnalysis?.analysis?.scores || analysis?.analyses?.[0]?.scores || {};
    const mistakes = myAnalysis?.analysis?.mistakes || analysis?.analyses?.[0]?.mistakes || [];

    return (
        <div className="min-h-screen bg-background">
            <Navbar />
            <main className="container py-8 space-y-6">
                <h1 className="text-3xl font-bold">Session Feedback</h1>

                {/* Scores */}
                <div className="grid gap-4 md:grid-cols-4">
                    {Object.entries(scores).map(([key, value]: [string, any]) => (
                        <Card key={key}>
                            <CardHeader className="pb-2">
                                <CardTitle className="text-sm font-medium uppercase text-muted-foreground">{key}</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold">{typeof value === 'number' ? Math.round(value) : value}</div>
                            </CardContent>
                        </Card>
                    ))}
                </div>

                {/* Transcript & Mistakes */}
                <div className="grid gap-6 md:grid-cols-2">
                    <Card>
                        <CardHeader>
                            <CardTitle>Transcript</CardTitle>
                        </CardHeader>
                        <CardContent className="max-h-[500px] overflow-y-auto text-sm leading-relaxed">
                            {analysis?.feedback?.transcript || "No transcript available."}
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle>Improvement Areas</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4 max-h-[500px] overflow-y-auto">
                            {mistakes.length === 0 ? (
                                <div className="flex items-center text-green-600 gap-2">
                                    <CheckCircle className="w-5 h-5" />
                                    <span>Great job! No major mistakes detected.</span>
                                </div>
                            ) : (
                                mistakes.map((m: any, i: number) => (
                                    <div key={i} className="p-4 border rounded-lg bg-secondary/20">
                                        <div className="flex justify-between items-start mb-2">
                                            <span className="font-semibold text-destructive capitalize">{m.type.replace('_', ' ')}</span>
                                            <span className="text-xs text-muted-foreground bg-background px-2 py-1 rounded border">
                                                {m.severity}
                                            </span>
                                        </div>
                                        <div className="space-y-1 text-sm">
                                            <p><span className="text-muted-foreground">Original:</span> <span className="line-through decoration-destructive/50">{m.original}</span></p>
                                            <p><span className="text-muted-foreground">Better:</span> <span className="text-green-600 font-medium">{m.corrected}</span></p>
                                            <p className="mt-2 text-muted-foreground italic">Tip: {m.explanation}</p>
                                        </div>
                                    </div>
                                ))
                            )}
                        </CardContent>
                    </Card>
                </div>
            </main>
        </div>
    );
}
