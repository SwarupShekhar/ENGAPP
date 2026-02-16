import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { UserButton } from "@clerk/nextjs";

export function Navbar() {
    return (
        <nav className="border-b bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/60">
            <div className="container flex h-14 items-center">
                <div className="mr-4 hidden md:flex">
                    <Link href="/dashboard" className="mr-6 flex items-center space-x-2">
                        <span className="hidden font-bold sm:inline-block">EngR Web MVP</span>
                    </Link>
                    <nav className="flex items-center space-x-6 text-sm font-medium">
                        <Link href="/dashboard" className="transition-colors hover:text-foreground/80 text-foreground/60">
                            Dashboard
                        </Link>
                        <Link href="/assessment" className="transition-colors hover:text-foreground/80 text-foreground/60">
                            Assessment
                        </Link>
                        <Link href="/call" className="transition-colors hover:text-foreground/80 text-foreground/60">
                            Practice Call
                        </Link>
                    </nav>
                </div>
                <div className="flex flex-1 items-center justify-between space-x-2 md:justify-end">
                    <div className="w-full flex-1 md:w-auto md:flex-none">
                        {/* Search or other items could go here */}
                    </div>
                    <UserButton afterSignOutUrl="/" />
                </div>
            </div>
        </nav>
    );
}
