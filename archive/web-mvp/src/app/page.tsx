import { RedirectToSignIn, RedirectToUserProfile, SignedIn, SignedOut } from "@clerk/nextjs";
import { redirect } from 'next/navigation';
import { auth } from '@clerk/nextjs/server';

export default async function Home() {
  const { userId } = await auth();

  if (userId) {
    redirect('/dashboard');
  }

  return (
    <div className="flex h-screen items-center justify-center bg-gray-50 dark:bg-gray-900 flex-col gap-4">
      <h1 className="text-4xl font-bold">EngR Web MVP</h1>
      <p className="text-muted-foreground">Please sign in to continue testing.</p>
      <RedirectToSignIn />
    </div>
  );
}
