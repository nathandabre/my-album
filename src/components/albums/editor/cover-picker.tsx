"use client";

import Image from "next/image";
import { Image as ImageIcon, Star } from "lucide-react";

import { getAlbumMediaUrl } from "@/lib/album-media-url";

import type { AlbumDetail } from "./types";

export function CoverPicker({ album }: { album: AlbumDetail }) {
  if (album.photos.length === 0) return null;

  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
      <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-2">
        <Star className="h-4 w-4 text-amber-500" />
        Album Cover Photo
      </h3>
      {album.coverPhoto ? (
        <div className="flex flex-col sm:flex-row items-start gap-4">
          <div className="relative w-full sm:w-48 aspect-[16/10] rounded-xl overflow-hidden bg-muted shrink-0">
            <Image
              src={getAlbumMediaUrl(
                album.shareSlug,
                album.coverPhoto.id,
                "w-400,h-250,fo-auto,q-80",
              )}
              alt="Current album cover"
              fill
              sizes="192px"
              className="object-cover"
              unoptimized
            />
          </div>
          <div className="flex flex-col gap-2">
            <p className="text-sm text-foreground font-medium">
              This photo is displayed as the album thumbnail on your dashboard and in shared links.
            </p>
            <p className="text-xs text-muted-foreground">
              To change the cover, hover over any photo below and click the{" "}
              <span className="inline-flex items-center gap-0.5 font-medium text-foreground">
                <Star className="h-3 w-3" /> Cover
              </span>{" "}
              button.
            </p>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-3 rounded-xl border border-dashed border-border bg-muted/30 p-4">
          <ImageIcon className="h-8 w-8 text-muted-foreground/50" />
          <div>
            <p className="text-sm font-medium text-foreground">No cover photo set</p>
            <p className="text-xs text-muted-foreground">
              Upload a photo or hover over an existing one and click{" "}
              <span className="inline-flex items-center gap-0.5 font-medium text-foreground">
                <Star className="h-3 w-3" /> Cover
              </span>{" "}
              to set it as the album cover.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
