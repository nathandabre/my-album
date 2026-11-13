"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Lock, Loader2, KeyRound } from "lucide-react";

import { Button } from "@/components/ui/button";
import { verifyAlbumPasswordAction } from "@/app/actions/albums";

export function PasswordGate({
  shareSlug,
}: {
  shareSlug: string;
}) {
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function handleUnlock(e: React.FormEvent) {
    e.preventDefault();
    if (!password.trim()) return;

    setIsLoading(true);
    setError(null);

    try {
      const res = await verifyAlbumPasswordAction(shareSlug, password);
      if (res.error) {
        setError(res.error);
      } else {
        router.refresh();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to verify password");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="flex min-h-[70vh] items-center justify-center px-4">
      <div className="w-full max-w-md rounded-3xl border border-border bg-card p-8 shadow-xl text-center backdrop-blur-sm animate-in zoom-in-95 duration-200">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary mb-5">
          <KeyRound className="h-7 w-7" />
        </div>

        <h2 className="text-2xl font-bold tracking-tight text-foreground">
          Protected Album
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          This album is password protected. Enter the access code to continue.
        </p>

        <form onSubmit={handleUnlock} className="mt-6 space-y-4 text-left">
          {error && (
            <div className="rounded-xl border border-destructive/20 bg-destructive/10 p-3 text-xs text-destructive font-medium text-center">
              {error}
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
              Access Code / Password
            </label>
            <input
              type="password"
              required
              autoFocus
              placeholder="Enter passcode"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-xl border border-input bg-background px-4 py-2.5 text-sm outline-none transition-colors focus:border-primary focus:ring-1 focus:ring-primary"
            />
          </div>

          <Button type="submit" className="w-full h-10 rounded-xl" disabled={isLoading || !password.trim()}>
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Unlocking Gallery…
              </>
            ) : (
              <>
                <Lock className="mr-2 h-4 w-4" />
                View Gallery
              </>
            )}
          </Button>
        </form>
      </div>
    </div>
  );
}
