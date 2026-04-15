"use client";

import { useEffect, useState } from 'react';
import { Navbar } from '@/components/Navbar';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth, useUser } from '@clerk/nextjs';
import api from '@/lib/api';
import { Loader2, CheckCircle2 } from 'lucide-react';

const ENGLISH_LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2', 'beginner', 'intermediate', 'advanced'];

export default function SettingsPage() {
    const { isLoaded: authLoaded, userId, getToken } = useAuth();
    const { user: clerkUser } = useUser();

    const [formData, setFormData] = useState({
        fname: '',
        lname: '',
        gender: '',
        hobbies: '',
        nativeLang: '',
        level: 'A1'
    });

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [success, setSuccess] = useState(false);

    useEffect(() => {
        const fetchProfile = async () => {
            if (!authLoaded || !userId) return;
            try {
                const token = await getToken();
                const res = await api.get('/auth/me', {
                    headers: { Authorization: `Bearer ${token}` }
                });

                const profile = res.data.data;
                setFormData({
                    fname: profile.fname || clerkUser?.firstName || '',
                    lname: profile.lname || clerkUser?.lastName || '',
                    gender: profile.gender || '',
                    hobbies: profile.hobbies?.join(', ') || '',
                    nativeLang: profile.nativeLang || '',
                    level: profile.level || 'A1'
                });
            } catch (error) {
                console.error("Failed to fetch profile:", error);
            } finally {
                setLoading(false);
            }
        };

        fetchProfile();
    }, [authLoaded, userId, getToken, clerkUser]);

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);
        setSuccess(false);

        try {
            const token = await getToken();
            const hobbiesArray = formData.hobbies.split(',').map(h => h.trim()).filter(h => h !== '');

            // Note: The backend uses `POST /auth/register` to update/create via upsert
            await api.post('/auth/register', {
                clerkId: clerkUser?.id,
                firstName: formData.fname,
                lastName: formData.lname,
                gender: formData.gender,
                hobbies: hobbiesArray,
                nativeLang: formData.nativeLang,
                level: formData.level
            }, {
                headers: { Authorization: `Bearer ${token}` }
            });

            setSuccess(true);
            setTimeout(() => setSuccess(false), 3000);
        } catch (error) {
            console.error("Failed to save profile:", error);
            alert("Failed to save profile. Check backend logs.");
        } finally {
            setSaving(false);
        }
    };

    if (!authLoaded || loading) return <div className="flex h-screen items-center justify-center"><Loader2 className="animate-spin" /></div>;

    return (
        <div className="min-h-screen bg-background">
            <Navbar />
            <main className="container max-w-2xl py-8">
                <h1 className="text-3xl font-bold mb-6">Settings</h1>

                <Card>
                    <CardHeader>
                        <CardTitle>Profile Details</CardTitle>
                        <CardDescription>
                            Update your personal information to help the AI customize your learning experience.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <form onSubmit={handleSave} className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label htmlFor="fname">First Name</Label>
                                    <Input
                                        id="fname"
                                        value={formData.fname}
                                        onChange={(e) => setFormData({ ...formData, fname: e.target.value })}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="lname">Last Name</Label>
                                    <Input
                                        id="lname"
                                        value={formData.lname}
                                        onChange={(e) => setFormData({ ...formData, lname: e.target.value })}
                                    />
                                </div>
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="gender">Gender</Label>
                                <Input
                                    id="gender"
                                    placeholder="e.g. Male, Female, Non-binary"
                                    value={formData.gender}
                                    onChange={(e) => setFormData({ ...formData, gender: e.target.value })}
                                />
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="nativeLang">Native Language</Label>
                                <Input
                                    id="nativeLang"
                                    placeholder="e.g. Hindi, Spanish"
                                    value={formData.nativeLang}
                                    onChange={(e) => setFormData({ ...formData, nativeLang: e.target.value })}
                                />
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="level">English Level</Label>
                                <select
                                    id="level"
                                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                                    value={formData.level}
                                    onChange={(e) => setFormData({ ...formData, level: e.target.value })}
                                >
                                    {ENGLISH_LEVELS.map(level => (
                                        <option key={level} value={level}>{level}</option>
                                    ))}
                                </select>
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="hobbies">Hobbies (Comma separated)</Label>
                                <Input
                                    id="hobbies"
                                    placeholder="e.g. Football, Coding, Reading"
                                    value={formData.hobbies}
                                    onChange={(e) => setFormData({ ...formData, hobbies: e.target.value })}
                                />
                                <p className="text-xs text-muted-foreground">The AI uses your hobbies to generate relevant conversation topics.</p>
                            </div>

                            <div className="pt-4 flex items-center gap-4">
                                <Button type="submit" disabled={saving}>
                                    {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                    Save Changes
                                </Button>
                                {success && (
                                    <div className="flex items-center text-green-600 animate-in fade-in zoom-in duration-300">
                                        <CheckCircle2 className="mr-2 h-4 w-4" />
                                        <span>Profile updated!</span>
                                    </div>
                                )}
                            </div>
                        </form>
                    </CardContent>
                </Card>
            </main>
        </div>
    );
}
