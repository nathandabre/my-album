"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  Globe,
  Lock,
  EyeOff,
  Copy,
  Check,
  ExternalLink,
  Trash2,
  Images,
  Settings,
} from "lucide-react";

import { deleteAlbumAction } from "@/app/actions/albums";
import { Button } from "@/components/ui/button";
import { getAlbumMediaUrl } from "@/lib/album-media-url";
import { AlbumVisibility } from "@/generated/prisma/enums";

export type AlbumCardData = {
  id: string;
  title: string;
  description: string | null;
  shareSlug: string;
  visibility: AlbumVisibility;
  allowDownload: boolean;
  createdAt: Date;
  coverPhoto: {
    id: string;
  } | null;
  _count: {
    photos: number;
  };
};

export function AlbumCard({ album }: { album: AlbumCardData }) {
  const [copied, setCopied] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showConfirmDelete, setShowConfirmDelete] = useState(false);

  const shareUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/a/${album.shareSlug}`
      : `/a/${album.shareSlug}`;

  const coverUrl = album.coverPhoto
    ? getAlbumMediaUrl(
        album.shareSlug,
        album.coverPhoto.id,
        "w-600,h-400,fo-auto,q-80",
      )
    : null;

  async function handleCopy(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
    }
  }

  async function handleDelete(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setIsDeleting(true);
    await deleteAlbumAction(album.id);
    setIsDeleting(false);
    setShowConfirmDelete(false);
  }

  return (
    <div className="group relative flex flex-col overflow-hidden rounded-2xl border border-border bg-card text-card-foreground shadow-sm transition-all hover:shadow-md hover:border-primary/40">
      {/* Cover Image Header */}
      <Link href={`/dashboard/albums/${album.id}`} className="relative aspect-[16/10] w-full overflow-hidden bg-muted">
        {coverUrl ? (
          <Image
            src={coverUrl}
            alt={album.title}
            fill
            sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
            className="object-cover transition-transform duration-300 group-hover:scale-105"
            unoptimized
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-muted to-muted/50 text-muted-foreground/60">
            <Images className="h-12 w-12" />
          </div>
        )}

        {/* Top Badges */}
        <div className="absolute top-3 left-3 right-3 flex items-center justify-between pointer-events-none">
          <span className="inline-flex items-center gap-1 rounded-full bg-black/60 px-2.5 py-1 text-xs font-medium text-white backdrop-blur-md">
            <Images className="h-3.5 w-3.5" />
            <span>{album._count.photos} {album._count.photos === 1 ? "item" : "items"}</span>
          </span>

          <span className="inline-flex items-center gap-1 rounded-full bg-black/60 px-2.5 py-1 text-xs font-medium text-white backdrop-blur-md">
            {album.visibility === AlbumVisibility.UNLISTED && (
              <>
                <Globe className="h-3 w-3" />
                <span>Unlisted</span>
              </>
            )}
            {album.visibility === AlbumVisibility.PASSWORD && (
              <>
                <Lock className="h-3 w-3" />
                <span>Password</span>
              </>
            )}
            {album.visibility === AlbumVisibility.PRIVATE && (
              <>
                <EyeOff className="h-3 w-3" />
                <span>Private</span>
              </>
            )}
          </span>
        </div>
      </Link>

      {/* Album Info */}
      <div className="flex flex-1 flex-col justify-between p-5">
        <div>
          <Link href={`/dashboard/albums/${album.id}`}>
            <h3 className="text-lg font-semibold tracking-tight text-foreground transition-colors hover:text-primary line-clamp-1">
              {album.title}
            </h3>
          </Link>
          {album.description ? (
            <p className="mt-1 text-sm text-muted-foreground line-clamp-2">
              {album.description}
            </p>
          ) : (
            <p className="mt-1 text-xs text-muted-foreground/60 italic">
              No description added
            </p>
          )}
        </div>

        {/* Actions Footer */}
        <div className="mt-4 pt-4 border-t border-border/60 flex items-center justify-between gap-2">
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              onClick={handleCopy}
              className="text-xs h-8 px-2.5"
              title="Copy public link"
            >
              {copied ? (
                <>
                  <Check className="h-3.5 w-3.5 text-emerald-500 mr-1" />
                  <span>Copied</span>
                </>
              ) : (
                <>
                  <Copy className="h-3.5 w-3.5 mr-1" />
                  <span>Share</span>
                </>
              )}
            </Button>

            <Link href={`/a/${album.shareSlug}`} target="_blank" rel="noopener noreferrer">
              <Button
                variant="ghost"
                size="sm"
                className="text-xs h-8 px-2 text-muted-foreground hover:text-foreground"
                title="Open public gallery in new tab"
              >
                <ExternalLink className="h-3.5 w-3.5" />
              </Button>
            </Link>
          </div>

          <div className="flex items-center gap-1">
            <Link href={`/dashboard/albums/${album.id}`}>
              <Button size="sm" className="text-xs h-8 px-3">
                <Settings className="h-3.5 w-3.5 mr-1.5" />
                Manage
              </Button>
            </Link>

            <Button
              variant="ghost"
              size="sm"
              onClick={(e) => {
                e.preventDefault();
                setShowConfirmDelete(true);
              }}
              className="text-xs h-8 px-2 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
              title="Delete album"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {showConfirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-5 shadow-2xl animate-in zoom-in-95 duration-150">
            <h4 className="text-base font-semibold text-foreground">Delete Album?</h4>
            <p className="mt-2 text-sm text-muted-foreground">
              Are you sure you want to delete <span className="font-medium text-foreground">&quot;{album.title}&quot;</span>? This will permanently remove all media in this album.
            </p>
            <div className="mt-5 flex items-center justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowConfirmDelete(false)}
                disabled={isDeleting}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={handleDelete}
                disabled={isDeleting}
              >
                {isDeleting ? "Deleting…" : "Delete Forever"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
