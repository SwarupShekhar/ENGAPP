"use client";

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export default function LoginPage() {
  const [userId, setUserId] = useState('');
  const router = useRouter();

  const handleLogin = () => {
    if (userId.trim()) {
      localStorage.setItem('userId', userId);
      router.push('/dashboard');
    }
  };

  return (
    <div className="flex h-screen items-center justify-center bg-gray-50 dark:bg-gray-900">
      <Card className="w-[350px]">
        <CardHeader>
          <CardTitle>EngR Web MVP</CardTitle>
          <CardDescription>Enter User ID to test backend features</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col space-y-4">
            <input
              type="text"
              placeholder="User ID (UUID)"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
            />
            <Button onClick={handleLogin}>
              Start Testing
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
