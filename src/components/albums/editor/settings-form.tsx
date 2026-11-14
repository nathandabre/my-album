"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Calendar,
  CheckCircle2,
  EyeOff,
  Globe,
  Loader2,
  Lock,
} from "lucide-react";

import { deleteAlbumAction, updateAlbumAction } from "@/app/actions/albums";
import { Button } from "@/components/ui/button";
import { AlbumVisibility } from "@/generated/prisma/enums";

import type { AlbumDetail } from "./types";

export function SettingsForm({ album }: { album: AlbumDetail }) {
  const router = useRouter();
  const [title, setTitle] = useState(album.title);
  const [description, setDescription] = useState(album.description ?? "");
  const [visibility, setVisibility] = useState<AlbumVisibility>(album.visibility);
  const [password, setPassword] = useState("");
  const [allowDownload, setAllowDownload] = useState(album.allowDownload);
  const [expiresAt, setExpiresAt] = useState(
    album.expiresAt ? new Date(album.expiresAt).toISOString().split("T")[0] : "",
  );
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [settingsSuccess, setSettingsSuccess] = useState(false);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [isDeletingAlbum, setIsDeletingAlbum] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  async function handleSaveSettings(event: React.FormEvent) {
    event.preventDefault();
    setIsSavingSettings(true);
    setSettingsError(null);
    setSettingsSuccess(false);

    try {
      const result = await updateAlbumAction(album.id, {
        title,
        description,
        visibility,
        password: password || undefined,
        allowDownload,
        expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
      });

      if (result.error) {
        setSettingsError(result.error);
      } else {
        setSettingsSuccess(true);
        setTimeout(() => setSettingsSuccess(false), 3000);
        router.refresh();
      }
    } catch (error) {
      setSettingsError(error instanceof Error ? error.message : "Failed to save");
    } finally {
      setIsSavingSettings(false);
    }
  }

  async function handleDeleteAlbum() {
    setIsDeletingAlbum(true);
    const result = await deleteAlbumAction(album.id);
    if (result.success) {
      router.push("/dashboard");
    } else {
      setIsDeletingAlbum(false);
      setShowDeleteModal(false);
    }
  }

  return (
    <div className="max-w-2xl space-y-8">
      <form
        onSubmit={handleSaveSettings}
        className="rounded-2xl border border-border bg-card p-6 shadow-sm space-y-6"
      >
        <h2 className="text-lg font-semibold tracking-tight text-foreground">
          Album Settings
        </h2>

        {settingsSuccess && (
          <div className="flex items-center gap-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 p-3 text-sm text-emerald-600">
            <CheckCircle2 className="h-4 w-4" />
            <span>Album settings saved successfully.</span>
          </div>
        )}

        {settingsError && (
          <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-3 text-sm text-destructive">
            {settingsError}
          </div>
        )}

        <div className="space-y-1.5">
          <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Album Title *
          </label>
          <input
            type="text"
            required
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
          />
        </div>

        <div className="space-y-1.5">
          <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Description
          </label>
          <textarea
            rows={3}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Details or welcome message for your clients..."
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary resize-none"
          />
        </div>

        <div className="space-y-2">
          <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Visibility & Access
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
          <div className="rounded-xl border border-border bg-muted/30 p-3.5 space-y-2">
            <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Update Password
            </label>
            <input
              type="password"
              placeholder="Leave empty to keep current password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
            />
          </div>
        )}

        <div className="space-y-1.5">
          <label className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <Calendar className="h-3.5 w-3.5 text-primary" />
            <span>Expiration Date (Optional)</span>
          </label>
          <input
            type="date"
            value={expiresAt}
            onChange={(event) => setExpiresAt(event.target.value)}
            className="w-full sm:w-64 rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
          />
          <p className="text-xs text-muted-foreground">
            After this date, guests will no longer be able to access the gallery. Clear to keep active indefinitely.
          </p>
        </div>

        <div className="flex items-center gap-2 pt-1">
          <input
            type="checkbox"
            id="editAllowDownload"
            checked={allowDownload}
            onChange={(event) => setAllowDownload(event.target.checked)}
            className="h-4 w-4 rounded border-border accent-primary focus:ring-primary"
          />
          <label
            htmlFor="editAllowDownload"
            className="text-sm text-foreground cursor-pointer select-none"
          >
            Allow clients to download images and videos
          </label>
        </div>

        <div className="flex justify-end pt-3 border-t border-border">
          <Button type="submit" disabled={isSavingSettings}>
            {isSavingSettings ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving…
              </>
            ) : (
              "Save Changes"
            )}
          </Button>
        </div>
      </form>

      <div className="rounded-2xl border border-destructive/20 bg-destructive/5 p-6 space-y-4">
        <h3 className="text-base font-semibold text-destructive">Danger Zone</h3>
        <p className="text-sm text-muted-foreground">
          Permanently delete this album and remove all associated media. This action cannot be undone.
        </p>
        <Button
          variant="destructive"
          size="sm"
          onClick={() => setShowDeleteModal(true)}
        >
          Delete Album
        </Button>
      </div>

      {showDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-5 shadow-2xl animate-in zoom-in-95 duration-150">
            <h4 className="text-base font-semibold text-foreground">Delete Album?</h4>
            <p className="mt-2 text-sm text-muted-foreground">
              Are you sure you want to delete{" "}
              <span className="font-medium text-foreground">&quot;{album.title}&quot;</span>? This will permanently delete all associated photos.
            </p>
            <div className="mt-5 flex items-center justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowDeleteModal(false)}
                disabled={isDeletingAlbum}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={handleDeleteAlbum}
                disabled={isDeletingAlbum}
              >
                {isDeletingAlbum ? "Deleting…" : "Delete Forever"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
