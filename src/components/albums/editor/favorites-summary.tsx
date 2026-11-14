"use client";

import Image from "next/image";
import { Heart } from "lucide-react";

import { getAlbumMediaUrl } from "@/lib/album-media-url";

import type { AlbumDetail } from "./types";

export function FavoritesSummary({
  album,
  totalFavorites,
}: {
  album: AlbumDetail;
  totalFavorites: number;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
      <h2 className="text-lg font-semibold tracking-tight text-foreground flex items-center gap-2">
        <Heart className="h-5 w-5 fill-rose-500 text-rose-500" />
        <span>Client Selections & Favorites</span>
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Review photos your clients have shortlisted and favorited for prints or retouching.
      </p>

      {totalFavorites === 0 ? (
        <div className="text-center py-12 border rounded-2xl border-dashed border-border mt-6">
          <Heart className="h-10 w-10 text-muted-foreground/40 mx-auto mb-2" />
          <p className="text-sm font-medium text-foreground">No media favorited yet</p>
          <p className="text-xs text-muted-foreground mt-1">
            Favorites from photos and videos in the shared gallery will appear here.
          </p>
        </div>
      ) : (
        <div className="mt-6 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {album.photos
            .filter((photo) => photo.favorites && photo.favorites.length > 0)
            .map((photo) => (
              <div
                key={photo.id}
                className="group relative flex flex-col overflow-hidden rounded-xl border border-border bg-card shadow-sm"
              >
                <div className="relative aspect-[4/3] w-full bg-muted">
                  {photo.mimeType.startsWith("video/") ? (
                    <video
                      src={getAlbumMediaUrl(album.shareSlug, photo.id)}
                      aria-label={photo.caption || "Album video"}
                      controls
                      controlsList="nodownload"
                      muted
                      playsInline
                      preload="metadata"
                      className="h-full w-full bg-black object-cover"
                    />
                  ) : (
                    <Image
                      src={getAlbumMediaUrl(
                        album.shareSlug,
                        photo.id,
                        "w-600,h-450,fo-auto,q-80",
                      )}
                      alt={photo.caption || "Photo"}
                      fill
                      className="object-cover"
                      unoptimized
                    />
                  )}
                  <div className="absolute top-2 right-2 flex items-center gap-1 rounded-full bg-rose-500 px-2 py-0.5 text-xs font-semibold text-white shadow-md">
                    <Heart className="h-3 w-3 fill-current" />
                    <span>{photo.favorites?.length}</span>
                  </div>
                </div>
                <div className="p-3 text-xs">
                  <p className="font-semibold text-foreground truncate">
                    {photo.caption || "Untitled"}
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-1">
                    Favorited by {photo.favorites?.length}{" "}
                    {photo.favorites?.length === 1 ? "guest" : "guests"}
                  </p>
                </div>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}
