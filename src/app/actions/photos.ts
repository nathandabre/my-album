"use server";

import { revalidatePath } from "next/cache";

import { requireDbUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

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

export type UploadedPhotoPayload = {
  imagekitFileId: string;
  filePath: string;
  caption?: string;
  width: number;
  height: number;
  sizeBytes: number;
  mimeType: string;
};

function validateUploadedPhoto(albumId: string, photo: UploadedPhotoPayload) {
  if (
    !photo ||
    typeof photo !== "object" ||
    typeof photo.imagekitFileId !== "string" ||
    typeof photo.filePath !== "string" ||
    typeof photo.mimeType !== "string" ||
    typeof photo.width !== "number" ||
    typeof photo.height !== "number" ||
    typeof photo.sizeBytes !== "number" ||
    (photo.caption !== undefined && typeof photo.caption !== "string")
  ) {
    return "Uploaded photo metadata is invalid.";
  }

  if (
    !photo.imagekitFileId.trim() ||
    photo.imagekitFileId.length > 255 ||
    !photo.filePath.startsWith(`/albums/${albumId}/`) ||
    photo.filePath.length > 1024
  ) {
    return "ImageKit did not return a valid photo for this album.";
  }
  if (!ALLOWED_MEDIA_TYPES.has(photo.mimeType)) {
    return "Only supported image and video files can be added to an album.";
  }
  const isVideo = photo.mimeType.startsWith("video/");
  if (
    !Number.isInteger(photo.width) ||
    photo.width < (isVideo ? 0 : 1) ||
    photo.width > 100_000 ||
    !Number.isInteger(photo.height) ||
    photo.height < (isVideo ? 0 : 1) ||
    photo.height > 100_000 ||
    !Number.isInteger(photo.sizeBytes) ||
    photo.sizeBytes <= 0 ||
    photo.sizeBytes > (isVideo ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES) ||
    (photo.caption?.length ?? 0) > 500
  ) {
    return "Photo dimensions, size, or caption are invalid.";
  }

  return null;
}

export async function addPhotosToAlbumAction(
  albumId: string,
  photos: UploadedPhotoPayload[],
) {
  const user = await requireDbUser();

  const album = await prisma.album.findFirst({
    where: { id: albumId, ownerId: user.id },
    select: { id: true, shareSlug: true, coverPhotoId: true },
  });

  if (!album) {
    return { error: "Album not found or unauthorized" };
  }

  if (!Array.isArray(photos) || photos.length === 0) {
    return { error: "No photos to add" };
  }
  if (photos.length > MAX_PHOTOS_PER_UPLOAD) {
    return { error: `Upload no more than ${MAX_PHOTOS_PER_UPLOAD} photos at a time.` };
  }

  for (const photo of photos) {
    const error = validateUploadedPhoto(albumId, photo);
    if (error) return { error };
  }

  const createdPhotos = await prisma.$transaction(async (tx) => {
    const lastPhoto = await tx.photo.findFirst({
      where: { albumId },
      orderBy: { sortOrder: "desc" },
      select: { sortOrder: true },
    });
    let currentOrder = (lastPhoto?.sortOrder ?? -1) + 1;
    const created = [];

    for (const item of photos) {
      created.push(
        await tx.photo.create({
          data: {
            albumId,
            imagekitFileId: item.imagekitFileId.trim(),
            filePath: item.filePath,
            caption: item.caption?.trim() || null,
            width: item.width,
            height: item.height,
            sizeBytes: item.sizeBytes,
            mimeType: item.mimeType,
            sortOrder: currentOrder++,
          },
        }),
      );
    }

    const firstImage = created.find((item) => item.mimeType.startsWith("image/"));
    if (!album.coverPhotoId && firstImage) {
      await tx.album.update({
        where: { id: albumId },
        data: { coverPhotoId: firstImage.id },
      });
    }

    return created;
  });

  revalidatePath(`/dashboard/albums/${albumId}`);
  revalidatePath("/dashboard");
  revalidatePath(`/a/${album.shareSlug}`);

  return { success: true, count: createdPhotos.length };
}

export async function deletePhotoAction(albumId: string, photoId: string) {
  const user = await requireDbUser();

  const album = await prisma.album.findFirst({
    where: { id: albumId, ownerId: user.id },
    select: { id: true, shareSlug: true, coverPhotoId: true },
  });

  if (!album) {
    return { error: "Album not found or unauthorized" };
  }

  const photo = await prisma.photo.findFirst({
    where: { id: photoId, albumId },
    select: { id: true },
  });
  if (!photo) return { error: "Photo not found in this album" };

  await prisma.$transaction(async (tx) => {
    if (album.coverPhotoId === photoId) {
      const nextPhoto = await tx.photo.findFirst({
        where: {
          albumId,
          id: { not: photoId },
          mimeType: { startsWith: "image/" },
        },
        orderBy: { sortOrder: "asc" },
        select: { id: true },
      });

      await tx.album.update({
        where: { id: albumId },
        data: { coverPhotoId: nextPhoto?.id ?? null },
      });
    }

    await tx.photo.delete({ where: { id: photoId, albumId } });
  });

  revalidatePath(`/dashboard/albums/${albumId}`);
  revalidatePath("/dashboard");
  revalidatePath(`/a/${album.shareSlug}`);

  return { success: true };
}

export async function setAlbumCoverAction(albumId: string, photoId: string) {
  const user = await requireDbUser();

  const album = await prisma.album.findFirst({
    where: { id: albumId, ownerId: user.id },
    select: { id: true, shareSlug: true },
  });

  if (!album) {
    return { error: "Album not found or unauthorized" };
  }

  const photo = await prisma.photo.findFirst({
    where: { id: photoId, albumId },
    select: { id: true, mimeType: true },
  });
  if (!photo) {
    return { error: "Photo not found in this album" };
  }
  if (!photo.mimeType.startsWith("image/")) {
    return { error: "Only images can be used as an album cover" };
  }

  await prisma.album.update({
    where: { id: albumId },
    data: { coverPhotoId: photoId },
  });

  revalidatePath(`/dashboard/albums/${albumId}`);
  revalidatePath("/dashboard");
  revalidatePath(`/a/${album.shareSlug}`);

  return { success: true };
}

export async function updatePhotoCaptionAction(
  albumId: string,
  photoId: string,
  caption: string,
) {
  const user = await requireDbUser();

  if (typeof caption !== "string" || caption.length > 500) {
    return { error: "Caption must be 500 characters or fewer." };
  }

  const updated = await prisma.photo.updateMany({
    where: { id: photoId, albumId, album: { ownerId: user.id } },
    data: { caption: caption.trim() || null },
  });
  if (updated.count === 0) return { error: "Photo not found or unauthorized" };

  revalidatePath(`/dashboard/albums/${albumId}`);
  return { success: true };
}

export async function togglePhotoFavoriteAction(
  photoId: string,
  guestId: string,
  guestName?: string,
) {
  if (!photoId || !guestId) {
    return { error: "Missing required parameters" };
  }

  const existing = await prisma.albumFavorite.findUnique({
    where: {
      photoId_guestId: { photoId, guestId },
    },
  });

  if (existing) {
    await prisma.albumFavorite.delete({
      where: { id: existing.id },
    });
    return { success: true, isFavorited: false };
  } else {
    await prisma.albumFavorite.create({
      data: {
        photoId,
        guestId,
        guestName: guestName?.trim() || null,
      },
    });
    return { success: true, isFavorited: true };
  }
}

export async function getGuestFavoritesAction(
  photoIds: string[],
  guestId: string,
) {
  if (!guestId || photoIds.length === 0) {
    return [];
  }

  const favorites = await prisma.albumFavorite.findMany({
    where: {
      guestId,
      photoId: { in: photoIds },
    },
    select: { photoId: true },
  });

  return favorites.map((f) => f.photoId);
}
