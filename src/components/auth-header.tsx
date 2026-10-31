import {
  Show,
  SignInButton,
  SignUpButton,
  UserButton,
} from "@clerk/nextjs";
import Link from "next/link";

import { Button } from "@/components/ui/button";

export async function AuthHeader() {
  return (
    <header className="flex items-center justify-between gap-4 border-b px-6 py-4">
      <Link href="/" className="text-lg font-semibold tracking-tight">
        my-album
      </Link>
      <div className="flex items-center gap-2">
        <Show when="signed-out">
          <SignInButton mode="modal">
            <Button variant="ghost">Sign in</Button>
          </SignInButton>
          <SignUpButton mode="modal">
            <Button>Get started</Button>
          </SignUpButton>
        </Show>
        <Show when="signed-in">
          <Link href="/dashboard">
            <Button variant="ghost">Dashboard</Button>
          </Link>
          <UserButton />
        </Show>
      </div>
    </header>
  );
}
