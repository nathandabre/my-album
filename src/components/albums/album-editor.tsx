"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  UploadCloud,
  ExternalLink,
  Copy,
  Check,
  Star,
  Trash2,
  Settings,
  Image as ImageIcon,
  ArrowLeft,
  Lock,
  Globe,
  EyeOff,
  Loader2,
  CheckCircle2,
  Heart,
  Pencil,
  Calendar,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { uploadImageToImageKit } from "@/lib/imagekit";
import { getAlbumMediaUrl } from "@/lib/album-media-url";
import {
  addPhotosToAlbumAction,
  cleanupFailedImageKitUploadsAction,
  deletePhotoAction,
  setAlbumCoverAction,
  updatePhotoCaptionAction,
} from "@/app/actions/photos";
import {
  updateAlbumAction,
  deleteAlbumAction,
} from "@/app/actions/albums";
import { AlbumVisibility } from "@/generated/prisma/enums";

type PhotoFavorite = {
  id: string;
  guestName: string | null;
};

type PhotoItem = {
  id: string;
  caption: string | null;
  width: number;
  height: number;
  sizeBytes: number;
  mimeType: string;
  sortOrder: number;
  favorites?: PhotoFavorite[];
};

type AlbumDetail = {
  id: string;
  title: string;
  description: string | null;
  shareSlug: string;
  visibility: AlbumVisibility;
  allowDownload: boolean;
  coverPhotoId: string | null;
  coverPhoto: {
    id: string;
  } | null;
  expiresAt?: Date | null;
  createdAt: Date;
  photos: PhotoItem[];
};

const MAX_PHOTOS_PER_UPLOAD = 100;
const MAX_IMAGE_BYTES = 200_000_000;
const MAX_VIDEO_BYTES = 2_000_000_000;
const ALLOWED_MEDIA_TYPES = new Set([
  "image/avif",
  "image/gif",
  "image/jpeg",
  "image/png",
  "image/webp",
  "video/mp4",
  "video/quicktime",
  "video/webm",
]);

export function AlbumEditor({ album }: { album: AlbumDetail }) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<"photos" | "favorites" | "settings">("photos");

  // Share link state
  const [copied, setCopied] = useState(false);
  const shareUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/a/${album.shareSlug}`
      : `/a/${album.shareSlug}`;

  // Upload state
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStatusText, setUploadStatusText] = useState("");
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Settings form state
  const [title, setTitle] = useState(album.title);
  const [description, setDescription] = useState(album.description ?? "");
  const [visibility, setVisibility] = useState<AlbumVisibility>(album.visibility);
  const [password, setPassword] = useState("");
  const [allowDownload, setAllowDownload] = useState(album.allowDownload);
  const [expiresAt, setExpiresAt] = useState<string>(
    album.expiresAt ? new Date(album.expiresAt).toISOString().split("T")[0] : ""
  );
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [settingsSuccess, setSettingsSuccess] = useState(false);
  const [settingsError, setSettingsError] = useState<string | null>(null);

  // Deleting album state
  const [isDeletingAlbum, setIsDeletingAlbum] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  // Photos action states
  const [deletingPhotoId, setDeletingPhotoId] = useState<string | null>(null);
  const [settingCoverId, setSettingCoverId] = useState<string | null>(null);

  // Cover set success feedback
  const [coverSetSuccess, setCoverSetSuccess] = useState(false);

  // Inline editing caption state
  const [editingCaptionPhotoId, setEditingCaptionPhotoId] = useState<string | null>(null);
  const [captionText, setCaptionText] = useState("");
  const [isSavingCaption, setIsSavingCaption] = useState(false);

  const totalFavorites = album.photos.reduce(
    (sum, p) => sum + (p.favorites?.length || 0),
    0
  );

  async function handleCopyLink() {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
    }
  }

  // Handle Multi-file Upload
  async function handleFilesUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;

    if (files.length > MAX_PHOTOS_PER_UPLOAD) {
      setUploadError(`Upload no more than ${MAX_PHOTOS_PER_UPLOAD} photos at a time.`);
      e.target.value = "";
      return;
    }
    const invalidFile = files.find(
      (file) => {
        const maxBytes = file.type.startsWith("video/")
          ? MAX_VIDEO_BYTES
          : MAX_IMAGE_BYTES;
        return !ALLOWED_MEDIA_TYPES.has(file.type) || file.size <= 0 || file.size > maxBytes;
      },
    );
    if (invalidFile) {
      setUploadError(
        `${invalidFile.name} is not a supported image/video or exceeds its size limit (200 MB per image, 2 GB per video).`,
      );
      e.target.value = "";
      return;
    }

    setIsUploading(true);
    setUploadError(null);
    setUploadProgress(0);

    const uploadedPayloads = [];
    const uploadedFileIds: string[] = [];

    try {
      for (const [index, file] of files.entries()) {
        setUploadStatusText(`Uploading ${index + 1} of ${files.length} media files…`);

        const result = await uploadImageToImageKit(file, album.id, {
          onProgress: (percent) => {
            const overall = Math.round(
              ((index + percent / 100) / files.length) * 100,
            );
            setUploadProgress(overall);
          },
        });

        if (result.fileId) uploadedFileIds.push(result.fileId);
        if (!result.fileId || !result.filePath || result.isPrivateFile !== true) {
          throw new Error(`ImageKit did not return valid metadata for ${file.name}.`);
        }

        uploadedPayloads.push({
          imagekitFileId: result.fileId,
          caption: file.name.replace(/\.[^/.]+$/, ""),
          mimeType: file.type,
        });
      }

      setUploadStatusText("Saving media to album…");
      const addRes = await addPhotosToAlbumAction(album.id, uploadedPayloads);

      if (addRes.error) {
        const cleanup = await cleanupFailedImageKitUploadsAction(
          album.id,
          uploadedFileIds,
        );
        setUploadError(
          (typeof cleanup.cleanupPending === "number"
            ? cleanup.cleanupPending > 0
            : uploadedFileIds.length > 0)
            ? `${addRes.error} Storage cleanup is pending.`
            : addRes.error,
        );
      } else {
        router.refresh();
      }
    } catch (err) {
      let cleanupPending = 0;
      if (uploadedFileIds.length > 0) {
        try {
          const cleanup = await cleanupFailedImageKitUploadsAction(
            album.id,
            uploadedFileIds,
          );
          cleanupPending =
            typeof cleanup.cleanupPending === "number"
              ? cleanup.cleanupPending
              : uploadedFileIds.length;
        } catch {
          cleanupPending = uploadedFileIds.length;
        }
      }
      const message = err instanceof Error ? err.message : "Failed to upload media.";
      setUploadError(
        cleanupPending > 0
          ? `${message} Storage cleanup is pending for ${cleanupPending} file(s).`
          : message,
      );
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
      setUploadStatusText("");
      e.target.value = "";
    }
  }

  async function handleDeletePhoto(photoId: string) {
    setDeletingPhotoId(photoId);
    const result = await deletePhotoAction(album.id, photoId);
    if (result.error) {
      setUploadError(result.error);
    } else if (result.cleanupPending) {
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

  async function handleSaveSettings(e: React.FormEvent) {
    e.preventDefault();
    setIsSavingSettings(true);
    setSettingsError(null);
    setSettingsSuccess(false);

    try {
      const res = await updateAlbumAction(album.id, {
        title,
        description,
        visibility,
        password: password || undefined,
        allowDownload,
        expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
      });

      if (res.error) {
        setSettingsError(res.error);
      } else {
        setSettingsSuccess(true);
        setTimeout(() => setSettingsSuccess(false), 3000);
        router.refresh();
      }
    } catch (err) {
      setSettingsError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setIsSavingSettings(false);
    }
  }

  async function handleDeleteAlbum() {
    setIsDeletingAlbum(true);
    const res = await deleteAlbumAction(album.id);
    if (res.success) {
      router.push("/dashboard");
    } else {
      setIsDeletingAlbum(false);
      setShowDeleteModal(false);
    }
  }

  function formatBytes(bytes: number) {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
  }

  return (
    <div className="space-y-8">
      {/* Top Navigation & Breadcrumbs */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Link href="/dashboard">
            <Button variant="ghost" size="sm" className="h-9 px-2 text-muted-foreground hover:text-foreground">
              <ArrowLeft className="h-4 w-4 mr-1" />
              <span>Back</span>
            </Button>
          </Link>
          <span className="text-muted-foreground">/</span>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground line-clamp-1">
            {album.title}
          </h1>
        </div>

        {/* Share & Guest View Bar */}
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleCopyLink}
            className="flex items-center gap-1.5 shadow-sm text-xs h-9 px-3"
          >
            {copied ? (
              <>
                <Check className="h-3.5 w-3.5 text-emerald-500" />
                <span className="text-emerald-600 font-medium">Link Copied!</span>
              </>
            ) : (
              <>
                <Copy className="h-3.5 w-3.5" />
                <span>Copy Share Link</span>
              </>
            )}
          </Button>

          <Link href={`/a/${album.shareSlug}`} target="_blank" rel="noopener noreferrer">
            <Button size="sm" className="flex items-center gap-1.5 text-xs h-9 px-3">
              <ExternalLink className="h-3.5 w-3.5" />
              <span>Preview Gallery</span>
            </Button>
          </Link>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex items-center gap-2 border-b border-border pb-px">
        <button
          onClick={() => setActiveTab("photos")}
          className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
            activeTab === "photos"
              ? "border-primary text-foreground font-semibold"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <ImageIcon className="h-4 w-4" />
          <span>Media ({album.photos.length})</span>
        </button>

        <button
          onClick={() => setActiveTab("favorites")}
          className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
            activeTab === "favorites"
              ? "border-primary text-foreground font-semibold"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <Heart className="h-4 w-4 text-rose-500" />
          <span>Client Favorites ({totalFavorites})</span>
        </button>

        <button
          onClick={() => setActiveTab("settings")}
          className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
            activeTab === "settings"
              ? "border-primary text-foreground font-semibold"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <Settings className="h-4 w-4" />
          <span>Settings</span>
        </button>
      </div>

      {/* Tab: Photos */}
      {activeTab === "photos" && (
        <div className="space-y-6">
          {/* Upload Dropzone */}
          <div className="relative rounded-2xl border-2 border-dashed border-border bg-card/40 p-8 text-center transition-all hover:bg-card/70 hover:border-primary/50">
            <input
              type="file"
              accept="image/avif,image/gif,image/jpeg,image/png,image/webp,video/mp4,video/quicktime,video/webm"
              multiple
              disabled={isUploading}
              onChange={handleFilesUpload}
              className="absolute inset-0 cursor-pointer opacity-0 disabled:cursor-not-allowed"
            />
            <div className="flex flex-col items-center justify-center">
              <div className="rounded-2xl bg-primary/10 p-3.5 text-primary mb-3">
                <UploadCloud className="h-8 w-8" />
              </div>
              <h3 className="text-base font-semibold text-foreground">
                {isUploading ? uploadStatusText : "Click or drag & drop photos and videos here"}
              </h3>
              <p className="mt-1 text-xs text-muted-foreground">
                Supports JPG, PNG, WEBP, MP4, MOV, and WEBM. Videos up to 2 GB.
              </p>

              {isUploading && (
                <div className="mt-4 w-full max-w-xs space-y-1.5">
                  <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full bg-primary transition-all duration-200"
                      style={{ width: `${uploadProgress}%` }}
                    />
                  </div>
                  <span className="text-xs font-medium text-muted-foreground">
                    {uploadProgress}% completed
                  </span>
                </div>
              )}

              {uploadError && (
                <p className="mt-3 text-xs text-destructive font-medium">
                  {uploadError}
                </p>
              )}
            </div>
          </div>

          {/* Cover Photo Updated Notification */}
          {coverSetSuccess && (
            <div className="flex items-center gap-2 rounded-xl bg-amber-500/10 border border-amber-500/20 p-3 text-sm text-amber-700 animate-in fade-in slide-in-from-top-2 duration-200">
              <CheckCircle2 className="h-4 w-4 text-amber-500" />
              <span className="font-medium">Cover photo updated successfully!</span>
            </div>
          )}

          {/* Current Cover Photo Preview */}
          {album.photos.length > 0 && (
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
          )}

          {/* Photo Gallery Grid */}
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
                const favCount = photo.favorites?.length || 0;

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

                      {/* Top Badges */}
                      <div className="absolute top-2 left-2 flex flex-col gap-1">
                        {isCover && (
                          <div className="flex items-center gap-1 rounded-full bg-amber-500/90 backdrop-blur-sm px-2 py-0.5 text-[10px] font-semibold text-white shadow-sm">
                            <Star className="h-3 w-3 fill-current" />
                            <span>Cover</span>
                          </div>
                        )}
                        {favCount > 0 && (
                          <div className="flex items-center gap-1 rounded-full bg-rose-500/90 backdrop-blur-sm px-2 py-0.5 text-[10px] font-semibold text-white shadow-sm">
                            <Heart className="h-3 w-3 fill-current" />
                            <span>{favCount}</span>
                          </div>
                        )}
                      </div>

                      {/* Overlay action bar on hover */}
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

                    {/* Metadata footer / Caption editor */}
                    <div className="p-2.5 text-xs text-muted-foreground flex flex-col gap-1">
                      {editingCaptionPhotoId === photo.id ? (
                        <div className="flex items-center gap-1 mt-1">
                          <input
                            type="text"
                            value={captionText}
                            onChange={(e) => setCaptionText(e.target.value)}
                            placeholder="Add a caption..."
                            className="w-full rounded border border-input bg-background px-2 py-1 text-xs outline-none focus:border-primary"
                            autoFocus
                            onKeyDown={(e) => {
                              if (e.key === "Enter") handleSaveCaption(photo.id);
                              if (e.key === "Escape") setEditingCaptionPhotoId(null);
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
        </div>
      )}

      {/* Tab: Favorites Summary */}
      {activeTab === "favorites" && (
        <div className="space-y-6">
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
                  .filter((p) => p.favorites && p.favorites.length > 0)
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
                          Favorited by {photo.favorites?.length} {photo.favorites?.length === 1 ? "guest" : "guests"}
                        </p>
                      </div>
                    </div>
                  ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab: Settings */}
      {activeTab === "settings" && (
        <div className="max-w-2xl space-y-8">
          <form onSubmit={handleSaveSettings} className="rounded-2xl border border-border bg-card p-6 shadow-sm space-y-6">
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
                onChange={(e) => setTitle(e.target.value)}
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
                onChange={(e) => setDescription(e.target.value)}
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
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                />
              </div>
            )}

            {/* Expiration Date Section */}
            <div className="space-y-1.5">
              <label className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <Calendar className="h-3.5 w-3.5 text-primary" />
                <span>Expiration Date (Optional)</span>
              </label>
              <input
                type="date"
                value={expiresAt}
                onChange={(e) => setExpiresAt(e.target.value)}
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
                onChange={(e) => setAllowDownload(e.target.checked)}
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

          {/* Danger Zone */}
          <div className="rounded-2xl border border-destructive/20 bg-destructive/5 p-6 space-y-4">
            <h3 className="text-base font-semibold text-destructive">
              Danger Zone
            </h3>
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
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-5 shadow-2xl animate-in zoom-in-95 duration-150">
            <h4 className="text-base font-semibold text-foreground">Delete Album?</h4>
            <p className="mt-2 text-sm text-muted-foreground">
              Are you sure you want to delete <span className="font-medium text-foreground">&quot;{album.title}&quot;</span>? This will permanently delete all associated photos.
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
