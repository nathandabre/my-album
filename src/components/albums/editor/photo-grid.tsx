"use client";

import { useState, type Dispatch, type SetStateAction } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { CheckCircle2, Heart, Pencil, Star, Trash2 } from "lucide-react";

import {
  deletePhotoAction,
  setAlbumCoverAction,
  updatePhotoCaptionAction,
} from "@/app/actions/photos";
import { Button } from "@/components/ui/button";
import { getAlbumMediaUrl } from "@/lib/album-media-url";

import type { AlbumDetail } from "./types";

function formatBytes(bytes: number) {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

export function PhotoGrid({
  album,
  setUploadError,
}: {
  album: AlbumDetail;
  setUploadError: Dispatch<SetStateAction<string | null>>;
}) {
  const router = useRouter();
  const [deletingPhotoId, setDeletingPhotoId] = useState<string | null>(null);
  const [settingCoverId, setSettingCoverId] = useState<string | null>(null);
  const [coverSetSuccess, setCoverSetSuccess] = useState(false);
  const [editingCaptionPhotoId, setEditingCaptionPhotoId] = useState<string | null>(null);
  const [captionText, setCaptionText] = useState("");
  const [isSavingCaption, setIsSavingCaption] = useState(false);

  async function handleDeletePhoto(photoId: string) {
    setDeletingPhotoId(photoId);
    const result = await deletePhotoAction(album.id, photoId);
    if (result.error) {
      setUploadError(result.error);
    } else if (result.cleanupQueued) {
      setUploadError("Photo removed from the album; ImageKit cleanup is pending.");
    }
    setDeletingPhotoId(null);
    router.refresh();
  }

  async function handleSetCover(photoId: string) {
    setSettingCoverId(photoId);
    await setAlbumCoverAction(album.id, photoId);
    setSettingCoverId(null);
    setCoverSetSuccess(true);
    setTimeout(() => setCoverSetSuccess(false), 2000);
    router.refresh();
  }

  async function handleSaveCaption(photoId: string) {
    setIsSavingCaption(true);
    await updatePhotoCaptionAction(album.id, photoId, captionText);
    setIsSavingCaption(false);
    setEditingCaptionPhotoId(null);
    router.refresh();
  }

  return (
    <>
      {coverSetSuccess && (
        <div className="flex items-center gap-2 rounded-xl bg-amber-500/10 border border-amber-500/20 p-3 text-sm text-amber-700 animate-in fade-in slide-in-from-top-2 duration-200">
          <CheckCircle2 className="h-4 w-4 text-amber-500" />
          <span className="font-medium">Cover photo updated successfully!</span>
        </div>
      )}

      {album.photos.length === 0 ? (
        <div className="text-center py-12 border rounded-2xl border-border bg-card/20">
          <p className="text-sm text-muted-foreground">
            No media in this album yet. Upload images or videos above to build your gallery.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {album.photos.map((photo) => {
            const isVideo = photo.mimeType.startsWith("video/");
            const isCover = album.coverPhotoId === photo.id;
            const thumbnailUrl = getAlbumMediaUrl(
              album.shareSlug,
              photo.id,
              isVideo ? undefined : "w-600,h-450,fo-auto,q-80",
            );
            const favoriteCount = photo.favorites?.length || 0;

            return (
              <div
                key={photo.id}
                className="group relative flex flex-col overflow-hidden rounded-xl border border-border bg-card shadow-sm transition-all hover:border-primary/40 hover:shadow-md"
              >
                <div className="relative aspect-[4/3] w-full bg-muted">
                  {isVideo ? (
                    <video
                      src={thumbnailUrl}
                      aria-label={photo.caption || "Album video"}
                      controls
                      muted
                      playsInline
                      preload="metadata"
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <Image
                      src={thumbnailUrl}
                      alt={photo.caption || "Photo"}
                      fill
                      sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
                      className="object-cover"
                      unoptimized
                    />
                  )}

                  <div className="absolute top-2 left-2 flex flex-col gap-1">
                    {isCover && (
                      <div className="flex items-center gap-1 rounded-full bg-amber-500/90 backdrop-blur-sm px-2 py-0.5 text-[10px] font-semibold text-white shadow-sm">
                        <Star className="h-3 w-3 fill-current" />
                        <span>Cover</span>
                      </div>
                    )}
                    {favoriteCount > 0 && (
                      <div className="flex items-center gap-1 rounded-full bg-rose-500/90 backdrop-blur-sm px-2 py-0.5 text-[10px] font-semibold text-white shadow-sm">
                        <Heart className="h-3 w-3 fill-current" />
                        <span>{favoriteCount}</span>
                      </div>
                    )}
                  </div>

                  <div className={`absolute inset-0 bg-black/50 opacity-0 transition-opacity group-hover:opacity-100 flex items-center justify-center gap-2 p-2 ${isVideo ? "pointer-events-none" : ""}`}>
                    {!isCover && !isVideo && (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => handleSetCover(photo.id)}
                        disabled={settingCoverId === photo.id}
                        className="pointer-events-auto text-xs h-7 px-2 bg-white/90 text-black hover:bg-white"
                        title="Set as album cover photo"
                      >
                        <Star className="h-3 w-3 mr-1" />
                        <span>Cover</span>
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => {
                        setEditingCaptionPhotoId(photo.id);
                        setCaptionText(photo.caption || "");
                      }}
                      className="pointer-events-auto text-xs h-7 px-2 bg-white/90 text-black hover:bg-white"
                      title="Edit caption"
                    >
                      <Pencil className="h-3 w-3" />
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => handleDeletePhoto(photo.id)}
                      disabled={deletingPhotoId === photo.id}
                      className="pointer-events-auto text-xs h-7 px-2"
                      title="Delete photo"
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>

                <div className="p-2.5 text-xs text-muted-foreground flex flex-col gap-1">
                  {editingCaptionPhotoId === photo.id ? (
                    <div className="flex items-center gap-1 mt-1">
                      <input
                        type="text"
                        value={captionText}
                        onChange={(event) => setCaptionText(event.target.value)}
                        placeholder="Add a caption..."
                        className="w-full rounded border border-input bg-background px-2 py-1 text-xs outline-none focus:border-primary"
                        autoFocus
                        onKeyDown={(event) => {
                          if (event.key === "Enter") handleSaveCaption(photo.id);
                          if (event.key === "Escape") setEditingCaptionPhotoId(null);
                        }}
                      />
                      <Button
                        size="sm"
                        className="h-6 px-2 text-[10px]"
                        onClick={() => handleSaveCaption(photo.id)}
                        disabled={isSavingCaption}
                      >
                        {isSavingCaption ? "…" : "Save"}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 px-1.5 text-[10px]"
                        onClick={() => setEditingCaptionPhotoId(null)}
                      >
                        ✕
                      </Button>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between">
                      <span
                        className="truncate cursor-pointer hover:underline text-foreground"
                        title="Click to edit caption"
                        onClick={() => {
                          setEditingCaptionPhotoId(photo.id);
                          setCaptionText(photo.caption || "");
                        }}
                      >
                        {photo.caption || "Untitled (add caption)"}
                      </span>
                      <span className="text-[10px] shrink-0 text-muted-foreground/70 ml-2">
                        {formatBytes(photo.sizeBytes)}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
