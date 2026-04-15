"use client";

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Navbar } from '@/components/Navbar';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { useAudioRecorder } from '@/hooks/useAudioRecorder';
import api from '@/lib/api';
import { Mic, Square, Loader2, Play, AlertCircle } from 'lucide-react';
import { useAuth } from '@clerk/nextjs';

// Phases
enum AssessmentPhase {
    PHASE_1 = 'PHASE_1',
    PHASE_2 = 'PHASE_2',
    PHASE_3 = 'PHASE_3',
    PHASE_4 = 'PHASE_4',
}

interface AssessmentState {
    sessionId: string | null;
    phase: AssessmentPhase;
    question: any; // Text or Object
    phaseData: any;
    isProcessing: boolean;
    error: string | null;
    feedback: string | null;
}

export default function AssessmentPage() {
    const router = useRouter();
    const { isLoaded, userId, getToken } = useAuth();
    const { isRecording, startRecording, stopRecording, audioBlob, audioUrl, resetRecording } = useAudioRecorder();

    const [state, setState] = useState<AssessmentState>({
        sessionId: null,
        phase: AssessmentPhase.PHASE_1,
        question: { text: "I like to eat apples.", level: 'A1' }, // Default starter
        phaseData: {},
        isProcessing: false,
        error: null,
        feedback: null
    });

    const [attempt, setAttempt] = useState(1);
    const hasStarted = useRef(false);

    // Initial Start
    useEffect(() => {
        const startAssessment = async () => {
            if (!isLoaded || !userId || hasStarted.current) return;
            hasStarted.current = true;

            try {
                const token = await getToken();

                // Start a new assessment session
                const res = await api.post('/assessment/start', {}, {
                    headers: { Authorization: `Bearer ${token}` }
                });
                setState(prev => ({ ...prev, sessionId: res.data.id }));
            } catch (err: any) {
                console.error("Failed to start assessment:", err);
                const msg = err.response?.data?.message || "Could not start assessment. Ensure you are eligible (e.g., 7 days cooling off).";
                setState(prev => ({ ...prev, error: msg }));
            }
        };

        startAssessment();
    }, [isLoaded, userId, getToken]);

    const submitAudio = async () => {
        if (!audioBlob || !state.sessionId) return;

        setState(prev => ({ ...prev, isProcessing: true, error: null, feedback: null }));

        // Convert Blob to Base64
        const reader = new FileReader();
        reader.readAsDataURL(audioBlob);
        reader.onloadend = async () => {
            const base64Audio = (reader.result as string).split(',')[1];

            try {
                const token = await getToken();
                const payload = {
                    assessmentId: state.sessionId,
                    phase: state.phase,
                    audioBase64: base64Audio,
                    attempt: state.phase === AssessmentPhase.PHASE_2 ? attempt : undefined
                };

                const res = await api.post('/assessment/submit', payload, {
                    headers: { Authorization: `Bearer ${token}` }
                });
                const data = res.data;

                // Handle Response
                if (data.nextPhase) {
                    if (data.nextPhase === 'COMPLETED') {
                        router.push(`/dashboard?completed=${state.sessionId}`);
                        return;
                    }

                    // Update Phase
                    setState(prev => ({
                        ...prev,
                        phase: data.nextPhase,
                        question: data.nextSentence || data.question || (data.imageUrl ? { imageUrl: data.imageUrl, text: "Describe this image in detail." } : prev.question),
                        isProcessing: false
                    }));

                    // Reset attempt for new phase
                    if (data.nextPhase !== state.phase) {
                        setAttempt(1);
                    } else if (state.phase === AssessmentPhase.PHASE_2) {
                        // If still Phase 2, increment attempt
                        setAttempt(prev => prev + 1);
                    }

                    resetRecording();
                } else if (data.hint) {
                    // Retry same phase
                    setState(prev => ({ ...prev, isProcessing: false, feedback: data.hint }));
                    resetRecording();
                }

            } catch (err: any) {
                console.error("Submission failed:", err);
                setState(prev => ({ ...prev, isProcessing: false, error: err.response?.data?.message || "Submission failed. Please try again." }));
            }
        };
    };

    const renderPhaseContent = () => {
        switch (state.phase) {
            case AssessmentPhase.PHASE_1:
            case AssessmentPhase.PHASE_2:
                return (
                    <div className="text-center space-y-4">
                        <h2 className="text-2xl font-bold">Read Aloud</h2>
                        <div className="p-6 bg-secondary/30 rounded-lg text-xl md:text-3xl font-medium leading-relaxed">
                            "{state.question?.text || state.question}"
                        </div>
                        {state.phase === AssessmentPhase.PHASE_2 && (
                            <p className="text-sm text-muted-foreground">Level: {state.question?.level || 'Adaptive'}</p>
                        )}
                    </div>
                );
            case AssessmentPhase.PHASE_3:
                return (
                    <div className="text-center space-y-4">
                        <h2 className="text-2xl font-bold">Image Description</h2>
                        {state.question?.imageUrl && (
                            <div className="flex justify-center">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                    src={state.question.imageUrl}
                                    alt="Describe this"
                                    className="max-h-[300px] rounded-lg shadow-lg object-cover"
                                />
                            </div>
                        )}
                        <p className="text-lg text-muted-foreground">Describe what you see in the image above detailedly.</p>
                    </div>
                );
            case AssessmentPhase.PHASE_4:
                return (
                    <div className="text-center space-y-4">
                        <h2 className="text-2xl font-bold">Open Response</h2>
                        <div className="p-6 bg-secondary/30 rounded-lg text-xl md:text-2xl font-medium">
                            {state.question?.text || state.question || "What is your biggest challenge in learning English?"}
                        </div>
                        <p className="text-lg text-muted-foreground">Speak freely for at least 30 seconds.</p>
                    </div>
                );
            default:
                return <div>Loading...</div>;
        }
    };

    if (!isLoaded) return <div className="flex h-screen items-center justify-center">Loading...</div>;
    if (!userId) return <div>Please sign in</div>;

    return (
        <div className="min-h-screen bg-background flex flex-col">
            <Navbar />
            <main className="flex-1 container flex flex-col items-center justify-center py-8">
                <Card className="w-full max-w-2xl">
                    <CardHeader>
                        <CardTitle className="flex justify-between items-center">
                            <span>Assessment</span>
                            <span className="text-sm font-normal px-3 py-1 bg-secondary rounded-full">
                                {state.phase.replace('_', ' ')} {state.phase === AssessmentPhase.PHASE_2 ? `- Attempt ${attempt}` : ''}
                            </span>
                        </CardTitle>
                        <CardDescription>
                            Follow the instructions for each phase. speak clearly.
                        </CardDescription>
                    </CardHeader>

                    <CardContent className="space-y-8 min-h-[300px] flex flex-col justify-center">
                        {state.error && (
                            <div className="bg-destructive/10 text-destructive p-3 rounded-md flex items-center gap-2">
                                <AlertCircle className="w-4 h-4" />
                                {state.error}
                            </div>
                        )}

                        {state.feedback && (
                            <div className="bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-200 p-3 rounded-md flex items-center gap-2">
                                <AlertCircle className="w-4 h-4" />
                                {state.feedback}
                            </div>
                        )}

                        {!state.sessionId ? (
                            <div className="flex justify-center py-10">
                                <Loader2 className="w-8 h-8 animate-spin text-primary" />
                            </div>
                        ) : (
                            renderPhaseContent()
                        )}

                        {/* Visualizer Placeholder */}
                        {isRecording && (
                            <div className="h-12 bg-secondary/50 rounded-full flex items-center justify-center overflow-hidden relative">
                                <div className="absolute inset-0 bg-red-500/10 animate-pulse"></div>
                                <div className="flex items-center gap-1 h-full">
                                    {[...Array(20)].map((_, i) => (
                                        <div
                                            key={i}
                                            className="w-1 bg-primary rounded-full animate-bounce"
                                            style={{
                                                height: `${Math.random() * 80 + 20}%`,
                                                animationDuration: `${Math.random() * 0.5 + 0.5}s`
                                            }}
                                        ></div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {audioUrl && !isRecording && (
                            <div className="flex justify-center">
                                <audio src={audioUrl} controls className="w-full max-w-md" />
                            </div>
                        )}

                    </CardContent>

                    <CardFooter className="flex justify-center gap-4 py-6 border-t bg-secondary/10">
                        {!isRecording && !audioBlob && (
                            <Button size="lg" className="h-14 w-14 rounded-full" onClick={startRecording} disabled={state.isProcessing || !state.sessionId}>
                                <Mic className="w-6 h-6" />
                            </Button>
                        )}

                        {isRecording && (
                            <Button size="lg" variant="destructive" className="h-14 w-14 rounded-full" onClick={stopRecording}>
                                <Square className="w-6 h-6 fill-current" />
                            </Button>
                        )}

                        {!isRecording && audioBlob && (
                            <>
                                <Button variant="outline" onClick={resetRecording} disabled={state.isProcessing}>
                                    Retry
                                </Button>
                                <Button onClick={submitAudio} disabled={state.isProcessing}>
                                    {state.isProcessing ? (
                                        <>
                                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                            Processing...
                                        </>
                                    ) : (
                                        "Submit Answer"
                                    )}
                                </Button>
                            </>
                        )}
                    </CardFooter>
                </Card>
            </main>
        </div>
    );
}
