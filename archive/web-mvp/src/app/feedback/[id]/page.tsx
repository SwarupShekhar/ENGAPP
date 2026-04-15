"use client";

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Navbar } from '@/components/Navbar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@clerk/nextjs';
import api from '@/lib/api';
import { Loader2, CheckCircle, Zap, Users, MessageSquare, Award, PlayCircle, BarChart2 } from 'lucide-react';
import { RadarChart } from '@/components/RadarChart';

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

    if (!isLoaded || loading) return <div className="flex h-screen items-center justify-center bg-zinc-950"><Loader2 className="animate-spin text-primary" /></div>;
    if (error) return <div className="flex h-screen items-center justify-center text-destructive bg-zinc-950">{error}</div>;

    const myAnalysis = analysis?.analyses?.find((a: any) => a.participant?.userId === userId);
    const partnerAnalysis = analysis?.analyses?.find((a: any) => a.participant?.userId !== userId);

    const myScores = myAnalysis?.scores || {};
    const partnerScores = partnerAnalysis?.scores || {};
    const mistakes = myAnalysis?.mistakes || [];

    const radarMetrics = ["grammar", "pronunciation", "fluency", "vocabulary"];
    const radarData = [
        {
            label: "You",
            scores: radarMetrics.map(m => ({ label: m, value: myScores[m] || 50 })),
            color: "#3b82f6"
        },
        {
            label: partnerAnalysis?.participant?.user?.fname || "Partner",
            scores: radarMetrics.map(m => ({ label: m, value: partnerScores[m] || 50 })),
            color: "#ec4899"
        }
    ];

    const interaction = analysis?.interactionMetrics || {};
    const peerComparison = analysis?.peerComparison || {};

    return (
        <div className="min-h-screen bg-[#09090b] text-zinc-100 selection:bg-primary/30">
            <Navbar />
            <main className="container max-w-6xl py-12 space-y-10">

                {/* Header Section */}
                <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 border-b border-white/5 pb-8">
                    <div>
                        <p className="text-primary font-bold tracking-widest text-xs uppercase mb-2">Practice Session Analysis</p>
                        <h1 className="text-4xl md:text-5xl font-black tracking-tight">Session Intelligence</h1>
                    </div>
                    <div className="flex bg-white/5 backdrop-blur-md p-1 rounded-2xl border border-white/10">
                        <div className="px-6 py-3 text-center">
                            <p className="text-[10px] uppercase font-bold text-zinc-500">Duration</p>
                            <p className="text-xl font-bold">{Math.floor((analysis?.duration || 0) / 60)}m {analysis?.duration % 60}s</p>
                        </div>
                        <div className="px-6 py-3 text-center border-l border-white/10">
                            <p className="text-[10px] uppercase font-bold text-zinc-500">CEFR Goal</p>
                            <p className="text-xl font-bold text-primary">{myAnalysis?.cefrLevel || "B1"}</p>
                        </div>
                    </div>
                </div>

                {/* Top Row: Comparative Skills & Interaction Intelligence */}
                <div className="grid gap-8 lg:grid-cols-2">

                    {/* Comparative Radar */}
                    <Card className="bg-zinc-900/40 border-white/5 overflow-hidden group">
                        <CardHeader className="border-b border-white/5 bg-white/2">
                            <CardTitle className="flex items-center gap-2 text-lg">
                                <Award className="w-5 h-5 text-yellow-500" />
                                Skill Distribution: You vs Partner
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="pt-8 flex justify-center">
                            <RadarChart data={radarData} metrics={radarMetrics} />
                        </CardContent>
                    </Card>

                    {/* Interaction Intelligence */}
                    <Card className="bg-zinc-900/40 border-white/5 overflow-hidden">
                        <CardHeader className="border-b border-white/5 bg-white/2">
                            <CardTitle className="flex items-center gap-2 text-lg">
                                <Zap className="w-5 h-5 text-primary" />
                                Conversational Dynamics
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="pt-8 space-y-6">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="p-4 rounded-2xl bg-white/5 border border-white/5">
                                    <p className="text-[10px] font-bold text-zinc-500 uppercase mb-1">Turn Taking</p>
                                    <p className="text-3xl font-black text-white">{interaction.turn_taking_score || 0}%</p>
                                </div>
                                <div className="p-4 rounded-2xl bg-white/5 border border-white/5">
                                    <p className="text-[10px] font-bold text-zinc-500 uppercase mb-1">Active Listening</p>
                                    <p className="text-3xl font-black text-white">{interaction.active_listening_score || 0}%</p>
                                </div>
                            </div>

                            <div className="space-y-4">
                                <h4 className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Flow Feedback</h4>
                                <p className="text-sm text-zinc-300 leading-relaxed italic">
                                    "{interaction.conversation_flow_feedback || "The conversation had a natural rhythm with balanced contributions."}"
                                </p>
                                <div className="flex flex-wrap gap-2">
                                    {interaction.backchanneling_detected?.map((tag: string) => (
                                        <span key={tag} className="px-3 py-1 bg-primary/10 border border-primary/20 text-primary text-[10px] uppercase font-bold rounded-full">
                                            {tag}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </div>

                {/* Middle Row: Synergy & Learning Opps */}
                <div className="grid gap-8 lg:grid-cols-3">
                    <Card className="lg:col-span-2 bg-linear-to-br from-primary/10 to-transparent border-primary/20">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2 text-lg">
                                <Users className="w-5 h-5" />
                                Learning Synergy
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <p className="text-zinc-200 leading-relaxed">
                                {peerComparison.synergy_feedback || "You and your partner complemented each other well, especially during the technical discussion."}
                            </p>
                            <div className="grid md:grid-cols-2 gap-4 pt-2">
                                <div className="bg-white/5 p-4 rounded-xl border border-white/5">
                                    <p className="text-[10px] font-bold text-primary uppercase mb-2">What you learned from them</p>
                                    <ul className="text-xs space-y-2 text-zinc-400">
                                        {peerComparison.relative_strengths?.[partnerAnalysis?.participant?.userId as string]?.slice(0, 2).map((s: string) => (
                                            <li key={s} className="flex gap-2">
                                                <div className="w-1 h-1 rounded-full bg-primary mt-1.5" />
                                                {s}
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                                <div className="bg-white/5 p-4 rounded-xl border border-white/5">
                                    <p className="text-[10px] font-bold text-pink-500 uppercase mb-2">What they learned from you</p>
                                    <ul className="text-xs space-y-2 text-zinc-400">
                                        {peerComparison.relative_strengths?.[userId as string]?.slice(0, 2).map((s: string) => (
                                            <li key={s} className="flex gap-2">
                                                <div className="w-1 h-1 rounded-full bg-pink-500 mt-1.5" />
                                                {s}
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="bg-zinc-900/40 border-white/5">
                        <CardHeader>
                            <CardTitle className="text-lg">Speaking Time</CardTitle>
                        </CardHeader>
                        <CardContent className="flex flex-col items-center justify-center pt-2">
                            <div className="flex w-full h-8 rounded-full overflow-hidden bg-white/5 mb-6">
                                <div className="bg-primary h-full transition-all" style={{ width: peerComparison.speaking_time_distribution?.[userId as string] || '50%' }} />
                                <div className="bg-pink-500 h-full transition-all" style={{ width: peerComparison.speaking_time_distribution?.[partnerAnalysis?.participant?.userId as string] || '50%' }} />
                            </div>
                            <div className="flex justify-between w-full text-[10px] font-bold uppercase tracking-widest text-zinc-500">
                                <span>You ({peerComparison.speaking_time_distribution?.[userId as string] || '50%'})</span>
                                <span>{partnerAnalysis?.participant?.user?.fname || "Partner"} ({peerComparison.speaking_time_distribution?.[partnerAnalysis?.participant?.userId as string] || '50%'})</span>
                            </div>
                        </CardContent>
                    </Card>

                </div>

                {/* Bottom Row: Detailed Errors & Transcript */}
                <div className="grid gap-8 lg:grid-cols-2">
                    {/* Mastery List */}
                    <Card className="bg-zinc-900/40 border-white/5">
                        <CardHeader className="flex flex-row items-center justify-between">
                            <CardTitle className="text-lg">Mistakes to Master</CardTitle>
                            <span className="bg-destructive/20 text-destructive text-[10px] font-black px-2 py-0.5 rounded-full">{mistakes.length} ERRORS</span>
                        </CardHeader>
                        <CardContent className="space-y-4 max-h-[600px] overflow-y-auto pr-2 custom-scrollbar">
                            {mistakes.length === 0 ? (
                                <div className="flex flex-col items-center justify-center py-20 text-center space-y-4">
                                    <div className="w-16 h-16 rounded-full bg-green-500/10 flex items-center justify-center">
                                        <CheckCircle className="w-8 h-8 text-green-500" />
                                    </div>
                                    <p className="text-zinc-400 font-medium italic">Perfect session! No grammatical issues detected.</p>
                                </div>
                            ) : (
                                mistakes.map((m: any, i: number) => (
                                    <div key={i} className="group p-6 rounded-2xl bg-white/5 border border-white/5 hover:border-primary/30 transition-all">
                                        <div className="flex justify-between items-start mb-4">
                                            <div className="flex items-center gap-3">
                                                <div className="w-8 h-8 rounded-lg bg-zinc-800 flex items-center justify-center text-zinc-500 group-hover:text-primary transition-colors">
                                                    <MessageSquare className="w-4 h-4" />
                                                </div>
                                                <span className="font-bold text-sm tracking-tight text-zinc-200 uppercase">{m.type.replace('_', ' ')}</span>
                                            </div>
                                            <span className={`text-xs text-muted-foreground bg-background px-2 py-1 rounded border uppercase ${m.severity === 'critical' ? 'bg-red-500/20 text-red-500' : 'bg-orange-500/20 text-orange-500'}`}>
                                                {m.severity}
                                            </span>
                                        </div>
                                        <div className="space-y-3">
                                            <div className="relative pl-4 border-l-2 border-red-500/30 py-1">
                                                <p className="text-xs font-bold text-zinc-500 uppercase mb-1">Your Words</p>
                                                <p className="text-sm text-zinc-300 italic">"{m.original}"</p>
                                            </div>
                                            <div className="relative pl-4 border-l-2 border-green-500/30 py-1">
                                                <p className="text-xs font-bold text-zinc-500 uppercase mb-1">Improved</p>
                                                <p className="text-sm text-green-400 font-medium">"{m.corrected}"</p>
                                            </div>
                                            <div className="mt-4 pt-4 border-t border-white/5">
                                                <p className="text-xs text-zinc-400 leading-relaxed font-medium bg-white/5 p-3 rounded-xl italic">
                                                    <Zap className="w-3 h-3 inline mr-2 text-yellow-500" />
                                                    {m.explanation}
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                ))
                            )}
                        </CardContent>
                    </Card>

                    {/* Enhanced Transcript */}
                    <Card className="bg-zinc-900/40 border-white/5">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2 text-lg">
                                <BarChart2 className="w-5 h-5 text-zinc-500" />
                                Session Transcript
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="max-h-[600px] overflow-y-auto pr-4 space-y-6 text-sm leading-relaxed custom-scrollbar">
                            <div className="bg-white/5 rounded-2xl p-6 whitespace-pre-wrap text-zinc-300 font-medium border border-white/5 shadow-inner">
                                {analysis?.feedback?.transcript || "No joint transcript available."}
                            </div>

                            {/* Action Items Call */}
                            <div className="p-6 rounded-2xl bg-primary/5 border border-primary/10 flex items-center gap-4">
                                <div className="w-12 h-12 rounded-full bg-primary flex items-center justify-center text-black">
                                    <PlayCircle className="w-6 h-6" />
                                </div>
                                <div>
                                    <h4 className="font-bold text-white">Refine these mistakes</h4>
                                    <p className="text-xs text-zinc-400">Practicing these specific corrections will help you reach {myAnalysis?.cefrLevel === 'B1' ? 'B2' : 'advanced'} proficiency faster.</p>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </div>

            </main>
        </div>
    );
}

