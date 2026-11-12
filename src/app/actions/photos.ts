"use server";

import { revalidatePath } from "next/cache";

import { requireDbUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

export type UploadedPhotoPayload = {
  imagekitFileId: string;
  filePath: string;
  caption?: string;
  width: number;
  height: number;
  sizeBytes: number;
  mimeType: string;
};

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

  if (!photos || photos.length === 0) {
    return { error: "No photos to add" };
  }

  // Get current highest sortOrder
  const lastPhoto = await prisma.photo.findFirst({
    where: { albumId },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });

  let currentOrder = (lastPhoto?.sortOrder ?? -1) + 1;
  const createdPhotos = [];

  for (const item of photos) {
    const photo = await prisma.photo.create({
      data: {
        albumId,
        imagekitFileId: item.imagekitFileId,
        filePath: item.filePath,
        caption: item.caption?.trim() || null,
        width: item.width || 1200,
        height: item.height || 800,
        sizeBytes: item.sizeBytes || 0,
        mimeType: item.mimeType || "image/jpeg",
        sortOrder: currentOrder++,
      },
    });
    createdPhotos.push(photo);
  }

  // If album has no cover photo yet, assign the first new photo as cover
  if (!album.coverPhotoId && createdPhotos[0]) {
    await prisma.album.update({
      where: { id: albumId },
      data: { coverPhotoId: createdPhotos[0].id },
    });
  }

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

  if (album.coverPhotoId === photoId) {
    // Find next available photo to set as cover
    const nextPhoto = await prisma.photo.findFirst({
      where: { albumId, id: { not: photoId } },
      orderBy: { sortOrder: "asc" },
      select: { id: true },
    });

    await prisma.album.update({
      where: { id: albumId },
      data: { coverPhotoId: nextPhoto?.id ?? null },
    });
  }

  await prisma.photo.delete({
    where: { id: photoId, albumId },
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

  const album = await prisma.album.findFirst({
    where: { id: albumId, ownerId: user.id },
  });

  if (!album) {
    return { error: "Unauthorized" };
  }

  await prisma.photo.update({
    where: { id: photoId, albumId },
    data: { caption: caption.trim() || null },
  });

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
