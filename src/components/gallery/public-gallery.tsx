"use client";

import { useState, useEffect, useCallback } from "react";
import Image from "next/image";
import {
  Heart,
  Download,
  Share2,
  Check,
  ChevronLeft,
  ChevronRight,
  X,
  Camera,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { getImageKitUrl } from "@/lib/imagekit";
import {
  togglePhotoFavoriteAction,
  getGuestFavoritesAction,
} from "@/app/actions/photos";

type PhotoData = {
  id: string;
  filePath: string;
  caption: string | null;
  width: number;
  height: number;
  sizeBytes: number;
  mimeType: string;
};

type OwnerData = {
  name: string | null;
  imageUrl: string | null;
};

export type PublicGalleryProps = {
  album: {
    id: string;
    title: string;
    description: string | null;
    shareSlug: string;
    allowDownload: boolean;
    coverPhoto?: {
      id: string;
      filePath: string;
    } | null;
    owner: OwnerData;
    photos: PhotoData[];
  };
};

export function PublicGallery({ album }: { album: PublicGalleryProps["album"] }) {
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());
  const [guestId, setGuestId] = useState<string>("");
  const [activeFilter, setActiveFilter] = useState<"all" | "favorites">("all");
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);

  // Initialize or read persistent guest ID
  useEffect(() => {
    let id = localStorage.getItem("my_album_guest_id");
    if (!id) {
      id = `guest_${Math.random().toString(36).substring(2, 10)}_${Date.now()}`;
      localStorage.setItem("my_album_guest_id", id);
    }
    const currentId = id;
    const ids = album.photos.map((p) => p.id);

    Promise.resolve().then(async () => {
      setGuestId(currentId);
      if (ids.length > 0) {
        const favs = await getGuestFavoritesAction(ids, currentId);
        setFavoriteIds(new Set(favs));
      }
    });
  }, [album.photos]);


  const displayedPhotos =
    activeFilter === "favorites"
      ? album.photos.filter((p) => favoriteIds.has(p.id))
      : album.photos;

  async function handleToggleFavorite(photoId: string, e?: React.MouseEvent) {
    e?.stopPropagation();
    if (!guestId) return;

    // Optimistic update
    const next = new Set(favoriteIds);
    if (next.has(photoId)) {
      next.delete(photoId);
    } else {
      next.add(photoId);
    }
    setFavoriteIds(next);

    await togglePhotoFavoriteAction(photoId, guestId);
  }

  async function handleShare() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
    }
  }

  function getPhotoDownloadUrl(photo: PhotoData) {
    return `/api/albums/${encodeURIComponent(album.shareSlug)}/downloads/${encodeURIComponent(photo.id)}`;
  }

  // Lightbox keyboard navigation
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (lightboxIndex === null) return;
      if (
        e.target instanceof HTMLVideoElement ||
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        (e.target instanceof HTMLElement && e.target.isContentEditable)
      ) {
        return;
      }
      if (e.key === "Escape") setLightboxIndex(null);
      if (e.key === "ArrowLeft") {
        setLightboxIndex((prev) =>
          prev !== null && prev > 0 ? prev - 1 : displayedPhotos.length - 1,
        );
      }
      if (e.key === "ArrowRight") {
        setLightboxIndex((prev) =>
          prev !== null && prev < displayedPhotos.length - 1 ? prev + 1 : 0,
        );
      }
    },
    [lightboxIndex, displayedPhotos.length],
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  const activePhoto =
    lightboxIndex !== null ? displayedPhotos[lightboxIndex] : null;

  return (
    <div className="min-h-screen bg-background text-foreground pb-20">
      {/* Cover Photo Hero Banner */}
      {album.coverPhoto && (
        <div className="relative w-full h-48 sm:h-64 md:h-80 lg:h-96 bg-muted overflow-hidden">
          <Image
            src={getImageKitUrl(album.coverPhoto.filePath, "w-1920,h-600,fo-auto,q-85")}
            alt={`${album.title} cover`}
            fill
            sizes="100vw"
            className="object-cover"
            priority
          />
          <div className="absolute inset-0 bg-gradient-to-t from-background via-background/30 to-transparent" />
        </div>
      )}

      {/* Hero Header */}
      <header className={`border-b border-border/80 bg-card/40 backdrop-blur-md ${album.coverPhoto ? "-mt-24 sm:-mt-32 relative z-10" : ""}`}>
        <div className="mx-auto max-w-7xl px-4 sm:px-6 py-12 sm:py-16 text-center">
          {/* Photographer Branding */}
          <div className="inline-flex items-center gap-2 rounded-full border border-border bg-background/80 px-3 py-1 shadow-sm mb-4">
            {album.owner.imageUrl ? (
              <Image
                src={album.owner.imageUrl}
                alt={album.owner.name || "Photographer"}
                width={20}
                height={20}
                className="rounded-full object-cover"
              />
            ) : (
              <Camera className="h-3.5 w-3.5 text-primary" />
            )}
            <span className="text-xs font-medium text-muted-foreground">
              Photographed by{" "}
              <strong className="text-foreground font-semibold">
                {album.owner.name || "Photographer"}
              </strong>
            </span>
          </div>

          <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight text-foreground text-balance">
            {album.title}
          </h1>

          {album.description && (
            <p className="mx-auto mt-4 max-w-2xl text-base sm:text-lg text-muted-foreground text-pretty">
              {album.description}
            </p>
          )}

          {/* Action Bar */}
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            {/* Filter Pills */}
            <div className="inline-flex rounded-full border border-border bg-card p-1 shadow-sm">
              <button
                onClick={() => setActiveFilter("all")}
                className={`rounded-full px-4 py-1.5 text-xs font-semibold transition-all ${
                  activeFilter === "all"
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                All Media ({album.photos.length})
              </button>
              <button
                onClick={() => setActiveFilter("favorites")}
                className={`flex items-center gap-1.5 rounded-full px-4 py-1.5 text-xs font-semibold transition-all ${
                  activeFilter === "favorites"
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Heart
                  className={`h-3.5 w-3.5 ${
                    favoriteIds.size > 0 ? "fill-rose-500 text-rose-500" : ""
                  }`}
                />
                <span>Favorites ({favoriteIds.size})</span>
              </button>
            </div>

            {/* Share Button */}
            <Button
              variant="outline"
              size="sm"
              onClick={handleShare}
              className="rounded-full shadow-sm text-xs h-9 px-4"
            >
              {copied ? (
                <>
                  <Check className="h-3.5 w-3.5 text-emerald-500 mr-1.5" />
                  <span>Link Copied</span>
                </>
              ) : (
                <>
                  <Share2 className="h-3.5 w-3.5 mr-1.5" />
                  <span>Share Gallery</span>
                </>
              )}
            </Button>
          </div>
        </div>
      </header>

      {/* Gallery Photos Grid */}
      <main className="mx-auto max-w-7xl px-4 sm:px-6 py-10">
        {displayedPhotos.length === 0 ? (
          <div className="text-center py-20 border rounded-3xl border-dashed border-border bg-card/20">
            {activeFilter === "favorites" ? (
              <>
                <Heart className="h-10 w-10 text-muted-foreground/50 mx-auto mb-3" />
                <h3 className="text-lg font-semibold text-foreground">
                  No favorites marked yet
                </h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Click the heart icon on any photo to add it to your favorites list.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setActiveFilter("all")}
                  className="mt-4"
                >
                  View all photos
                </Button>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                No images or videos in this album yet.
              </p>
            )}
          </div>
        ) : (
          <div className="columns-1 gap-4 sm:columns-2 lg:columns-3 xl:columns-4 space-y-4">
            {displayedPhotos.map((photo, index) => {
              const isFav = favoriteIds.has(photo.id);
              const isVideo = photo.mimeType.startsWith("video/");
              const previewUrl = getImageKitUrl(
                photo.filePath,
                isVideo ? undefined : "w-800,q-80",
              );

              return (
                <div
                  key={photo.id}
                  onClick={() => setLightboxIndex(index)}
                  className="group relative cursor-pointer break-inside-avoid overflow-hidden rounded-2xl border border-border/80 bg-muted/40 shadow-sm transition-all duration-300 hover:shadow-xl hover:border-primary/50 hover:-translate-y-0.5"
                >
                  {isVideo ? (
                    <video
                      src={previewUrl}
                      aria-label={photo.caption || "Album video"}
                      controls
                      controlsList="nodownload"
                      playsInline
                      preload="metadata"
                      onClick={(event) => event.stopPropagation()}
                      className="h-auto w-full bg-black"
                    />
                  ) : (
                    <Image
                      src={previewUrl}
                      alt={photo.caption || "Album photo"}
                      width={photo.width}
                      height={photo.height}
                      sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, (max-width: 1280px) 33vw, 25vw"
                      className="h-auto w-full object-cover transition-transform duration-500 group-hover:scale-[1.02]"
                      loading="lazy"
                    />
                  )}

                  {album.allowDownload ? (
                    <a
                      href={getPhotoDownloadUrl(photo)}
                      download
                      onClick={(event) => event.stopPropagation()}
                      aria-label={`Download ${photo.caption || "photo"}`}
                      className="absolute right-3 top-3 z-10 inline-flex h-9 items-center gap-1.5 rounded-full bg-background/90 px-3 text-xs font-semibold text-foreground opacity-100 shadow-sm backdrop-blur transition-opacity hover:bg-background sm:pointer-events-none sm:opacity-0 sm:group-hover:pointer-events-auto sm:group-hover:opacity-100 sm:group-focus-within:pointer-events-auto sm:group-focus-within:opacity-100"
                    >
                      <Download className="h-4 w-4" />
                      <span>Download</span>
                    </a>
                  ) : null}

                  {/* Gradient Overlay & Controls on Hover */}
                  <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-black/30 opacity-0 transition-opacity duration-200 group-hover:opacity-100 flex flex-col justify-between p-3.5">
                    {/* Top actions */}
                    <div className="flex items-center justify-between">
                      <button
                        onClick={(e) => handleToggleFavorite(photo.id, e)}
                        className={`pointer-events-auto flex h-9 w-9 items-center justify-center rounded-full backdrop-blur-md transition-transform active:scale-90 ${
                          isFav
                            ? "bg-rose-500 text-white"
                            : "bg-black/50 text-white hover:bg-black/75"
                        }`}
                        title={isFav ? "Remove favorite" : "Add to favorites"}
                      >
                        <Heart
                          className={`h-4 w-4 ${isFav ? "fill-current" : ""}`}
                        />
                      </button>

                    </div>

                    {/* Bottom caption / dimensions */}
                    <div className="text-white">
                      {photo.caption && (
                        <p className="text-sm font-semibold tracking-wide drop-shadow-md line-clamp-1">
                          {photo.caption}
                        </p>
                      )}
                      {photo.width > 0 && photo.height > 0 ? (
                        <p className="text-[11px] text-white/80 drop-shadow-md">
                          {photo.width} × {photo.height}
                        </p>
                      ) : null}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* Full-screen Lightbox Modal */}
      {activePhoto && lightboxIndex !== null && (
        <div
          onClick={() => setLightboxIndex(null)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/95 backdrop-blur-lg animate-in fade-in duration-200"
        >
          {/* Top Bar */}
          <div
            onClick={(e) => e.stopPropagation()}
            className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between p-4 sm:p-6 text-white bg-gradient-to-b from-black/80 to-transparent"
          >
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium text-white/80">
                {lightboxIndex + 1} / {displayedPhotos.length}
              </span>
              {activePhoto.caption && (
                <span className="hidden sm:inline text-sm font-semibold text-white truncate max-w-md">
                  — {activePhoto.caption}
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={(e) => handleToggleFavorite(activePhoto.id, e)}
                className={`flex h-10 w-10 items-center justify-center rounded-full transition-transform active:scale-90 ${
                  favoriteIds.has(activePhoto.id)
                    ? "bg-rose-500 text-white"
                    : "bg-white/10 text-white hover:bg-white/20"
                }`}
                title="Favorite"
              >
                <Heart
                  className={`h-5 w-5 ${
                    favoriteIds.has(activePhoto.id) ? "fill-current" : ""
                  }`}
                />
              </button>

              {album.allowDownload && (
                <a
                  href={getPhotoDownloadUrl(activePhoto)}
                  download
                  onClick={(event) => event.stopPropagation()}
                  aria-label="Download photo"
                  className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 transition-transform active:scale-90"
                  title="Download"
                >
                  <Download className="h-5 w-5" />
                </a>
              )}

              <button
                onClick={() => setLightboxIndex(null)}
                className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 transition-transform active:scale-90"
                title="Close (Esc)"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>

          {/* Left Arrow */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              setLightboxIndex((prev) =>
                prev !== null && prev > 0
                  ? prev - 1
                  : displayedPhotos.length - 1,
              );
            }}
            className="absolute left-4 z-10 flex h-12 w-12 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur-md hover:bg-black/70 transition-all hover:scale-105"
            title="Previous (Left Arrow)"
          >
            <ChevronLeft className="h-6 w-6" />
          </button>

          {/* Image Display */}
          <div
            onClick={(e) => e.stopPropagation()}
            className="relative flex h-full max-h-[85vh] w-full max-w-[90vw] items-center justify-center p-4"
          >
            {activePhoto.mimeType.startsWith("video/") ? (
              <video
                src={getImageKitUrl(activePhoto.filePath)}
                aria-label={activePhoto.caption || "Album video"}
                controls
                controlsList="nodownload"
                playsInline
                className="max-h-full max-w-full rounded-lg bg-black object-contain shadow-2xl"
              />
            ) : (
              <Image
                src={getImageKitUrl(activePhoto.filePath, "w-2000,q-90")}
                alt={activePhoto.caption || "Enlarged photo"}
                width={activePhoto.width}
                height={activePhoto.height}
                className="max-h-full max-w-full rounded-lg object-contain shadow-2xl animate-in zoom-in-95 duration-150"
                priority
              />
            )}
          </div>

          {/* Right Arrow */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              setLightboxIndex((prev) =>
                prev !== null && prev < displayedPhotos.length - 1
                  ? prev + 1
                  : 0,
              );
            }}
            className="absolute right-4 z-10 flex h-12 w-12 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur-md hover:bg-black/70 transition-all hover:scale-105"
            title="Next (Right Arrow)"
          >
            <ChevronRight className="h-6 w-6" />
          </button>

          {/* Bottom Bar Details */}
          <div
            onClick={(e) => e.stopPropagation()}
            className="absolute bottom-0 left-0 right-0 p-4 sm:p-6 text-center text-white/70 text-xs bg-gradient-to-t from-black/80 to-transparent"
          >
            {activePhoto.caption ? (
              <p className="text-white text-sm font-medium mb-1">
                {activePhoto.caption}
              </p>
            ) : null}
            <span>
              {activePhoto.width > 0 && activePhoto.height > 0
                ? `${activePhoto.width} × ${activePhoto.height} px`
                : activePhoto.mimeType}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
