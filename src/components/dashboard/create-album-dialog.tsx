"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, X, Lock, Globe, EyeOff, Loader2 } from "lucide-react";

import { createAlbumAction } from "@/app/actions/albums";
import { Button } from "@/components/ui/button";
import { AlbumVisibility } from "@/generated/prisma/enums";

export function CreateAlbumDialog() {
  const [isOpen, setIsOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [visibility, setVisibility] = useState<AlbumVisibility>(
    AlbumVisibility.UNLISTED,
  );
  const [password, setPassword] = useState("");
  const [allowDownload, setAllowDownload] = useState(false);
  const [expiresAt, setExpiresAt] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;

    setIsLoading(true);
    setError(null);

    try {
      const res = await createAlbumAction({
        title,
        description,
        visibility,
        password,
        allowDownload,
        expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
      });

      if (res.error) {
        setError(res.error);
        setIsLoading(false);
        return;
      }

      setIsOpen(false);
      setTitle("");
      setDescription("");
      setPassword("");
      setAllowDownload(false);
      setExpiresAt("");

      if (res.albumId) {
        router.push(`/dashboard/albums/${res.albumId}`);
      } else {
        router.refresh();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create album");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <>
      <Button
        onClick={() => setIsOpen(true)}
        className="flex items-center gap-2 shadow-sm"
      >
        <Plus className="h-4 w-4" />
        <span>Create Album</span>
      </Button>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="relative w-full max-w-lg rounded-2xl border border-border bg-card p-6 shadow-2xl animate-in zoom-in-95 duration-200">
            <button
              onClick={() => setIsOpen(false)}
              className="absolute right-4 top-4 rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            >
              <X className="h-4 w-4" />
            </button>

            <div className="mb-5">
              <h2 className="text-xl font-bold tracking-tight">Create New Album</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Scaffold a collection, upload photos, and share with your clients.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive border border-destructive/20">
                  {error}
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                  Album Title *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Sarah & Michael Wedding"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none transition-colors focus:border-primary focus:ring-1 focus:ring-primary"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                  Description (optional)
                </label>
                <textarea
                  rows={2}
                  placeholder="Brief note or client details..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none transition-colors focus:border-primary focus:ring-1 focus:ring-primary resize-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                  Visibility
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setVisibility(AlbumVisibility.UNLISTED)}
                    className={`flex flex-col items-center gap-1.5 rounded-xl border p-3 text-center transition-all ${
                      visibility === AlbumVisibility.UNLISTED
                        ? "border-primary bg-primary/5 text-foreground font-medium ring-1 ring-primary"
                        : "border-border text-muted-foreground hover:bg-muted/50"
                    }`}
                  >
                    <Globe className="h-4 w-4" />
                    <span className="text-xs">Unlisted</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setVisibility(AlbumVisibility.PASSWORD)}
                    className={`flex flex-col items-center gap-1.5 rounded-xl border p-3 text-center transition-all ${
                      visibility === AlbumVisibility.PASSWORD
                        ? "border-primary bg-primary/5 text-foreground font-medium ring-1 ring-primary"
                        : "border-border text-muted-foreground hover:bg-muted/50"
                    }`}
                  >
                    <Lock className="h-4 w-4" />
                    <span className="text-xs">Password</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setVisibility(AlbumVisibility.PRIVATE)}
                    className={`flex flex-col items-center gap-1.5 rounded-xl border p-3 text-center transition-all ${
                      visibility === AlbumVisibility.PRIVATE
                        ? "border-primary bg-primary/5 text-foreground font-medium ring-1 ring-primary"
                        : "border-border text-muted-foreground hover:bg-muted/50"
                    }`}
                  >
                    <EyeOff className="h-4 w-4" />
                    <span className="text-xs">Private</span>
                  </button>
                </div>
              </div>

              {visibility === AlbumVisibility.PASSWORD && (
                <div className="rounded-xl border border-border bg-muted/30 p-3 space-y-2">
                  <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Album Password *
                  </label>
                  <input
                    type="password"
                    required
                    placeholder="Enter passkey for clients"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none transition-colors focus:border-primary focus:ring-1 focus:ring-primary"
                  />
                  <p className="text-xs text-muted-foreground">
                    Clients will be asked for this password before viewing the gallery.
                  </p>
                </div>
              )}

              <div className="space-y-1">
                <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Expiration Date (Optional)
                </label>
                <input
                  type="date"
                  value={expiresAt}
                  onChange={(e) => setExpiresAt(e.target.value)}
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none transition-colors focus:border-primary focus:ring-1 focus:ring-primary"
                />
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="allowDownload"
                  checked={allowDownload}
                  onChange={(e) => setAllowDownload(e.target.checked)}
                  className="h-4 w-4 rounded border-border accent-primary focus:ring-primary"
                />
                <label
                  htmlFor="allowDownload"
                  className="text-sm text-foreground cursor-pointer select-none"
                >
                  Allow clients to download high-resolution photos
                </label>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-border">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsOpen(false)}
                  disabled={isLoading}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={isLoading || !title.trim()}>
                  {isLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Creating…
                    </>
                  ) : (
                    "Create & Start Uploading"
                  )}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
