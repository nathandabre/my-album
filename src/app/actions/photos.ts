"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getAlbumAccessDecision } from "@/lib/album-access";
import { requireDbUser } from "@/lib/auth";
import { getGuestSessionId } from "@/lib/guest-session";
import {
  deleteImageKitFileFromAlbum,
  verifyImageKitUpload,
  type VerifiedImageKitUpload,
} from "@/lib/imagekit-server";
import { prisma } from "@/lib/db";

const MAX_PHOTOS_PER_UPLOAD = 100;
const mediaTypes = [
  "image/avif",
  "image/gif",
  "image/jpeg",
  "image/png",
  "image/webp",
  "video/mp4",
  "video/quicktime",
  "video/webm",
] as const;

const albumIdSchema = z.string().trim().min(1).max(128);
const photoIdSchema = z.string().trim().min(1).max(128);
const uploadSchema = z
  .object({
    imagekitFileId: z.string().regex(/^[A-Za-z0-9_-]{1,255}$/),
    mimeType: z.enum(mediaTypes),
    caption: z.string().max(500).optional(),
  })
  .strict();
const guestFavoriteSchema = z.object({
  photoIds: z.array(photoIdSchema).max(1000),
});
const failedUploadCleanupSchema = z
  .object({
    albumId: albumIdSchema,
    fileIds: z.array(z.string().regex(/^[A-Za-z0-9_-]{1,255}$/)).max(100),
  })
  .strict();

export type UploadedPhotoPayload = z.infer<typeof uploadSchema>;

async function cleanupAlbumFiles(albumId: string, fileIds: string[]) {
  const results = await Promise.allSettled(
    fileIds.map((fileId) => deleteImageKitFileFromAlbum(albumId, fileId)),
  );
  const failures = results.filter((result) => result.status === "rejected").length;
  if (failures > 0) {
    console.error("ImageKit media cleanup failed", { failures });
  }
  return failures;
}

const accessiblePhotoSelect = {
  id: true,
  album: {
    select: {
      id: true,
      visibility: true,
      expiresAt: true,
      updatedAt: true,
      owner: { select: { clerkId: true } },
      shareSlug: true,
    },
  },
} as const;

export async function addPhotosToAlbumAction(
  rawAlbumId: unknown,
  rawPhotos: unknown,
) {
  const albumIdResult = albumIdSchema.safeParse(rawAlbumId);
  const photosResult = z.array(uploadSchema).min(1).max(MAX_PHOTOS_PER_UPLOAD).safeParse(rawPhotos);
  if (!albumIdResult.success || !photosResult.success) {
    return {
      error: `Upload no more than ${MAX_PHOTOS_PER_UPLOAD} supported media files at a time.`,
    };
  }
  const albumId = albumIdResult.data;
  const user = await requireDbUser();

  const album = await prisma.album.findFirst({
    where: { id: albumId, ownerId: user.id },
    select: { id: true, shareSlug: true, coverPhotoId: true },
  });
  if (!album) return { error: "Album not found or unauthorized" };

  const verifiedUploads: VerifiedImageKitUpload[] = [];
  try {
    for (const photo of photosResult.data) {
      verifiedUploads.push(
        await verifyImageKitUpload(
          albumId,
          photo.imagekitFileId,
          photo.mimeType,
        ),
      );
    }
  } catch (error) {
    await cleanupAlbumFiles(
      albumId,
      verifiedUploads.map((item) => item.fileId),
    );
    console.error("ImageKit upload verification failed", {
      error: error instanceof Error ? error.name : "UnknownError",
    });
    return { error: "One or more uploaded files could not be verified." };
  }

  let createdPhotoCount: number;
  try {
    const createdPhotos = await prisma.$transaction(async (tx) => {
      const lastPhoto = await tx.photo.findFirst({
        where: { albumId },
        orderBy: { sortOrder: "desc" },
        select: { sortOrder: true },
      });
      let currentOrder = (lastPhoto?.sortOrder ?? -1) + 1;
      const created = [];

      for (const [index, item] of verifiedUploads.entries()) {
        const photo = photosResult.data[index];
        created.push(
          await tx.photo.create({
            data: {
              albumId,
              imagekitFileId: item.fileId,
              filePath: item.filePath,
              caption: photo.caption?.trim() || null,
              width: item.width,
              height: item.height,
              sizeBytes: item.sizeBytes,
              mimeType: item.mimeType,
              isPrivate: item.isPrivate,
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
    createdPhotoCount = createdPhotos.length;
  } catch (error) {
    await cleanupAlbumFiles(
      albumId,
      verifiedUploads.map((item) => item.fileId),
    );
    console.error("Failed to save verified uploads to the album", {
      error: error instanceof Error ? error.name : "UnknownError",
    });
    return { error: "Unable to save the uploaded media. Please try again." };
  }

  revalidatePath(`/dashboard/albums/${albumId}`);
  revalidatePath("/dashboard");
  revalidatePath(`/a/${album.shareSlug}`);
  return { success: true, count: createdPhotoCount };
}

export async function cleanupFailedImageKitUploadsAction(
  rawAlbumId: unknown,
  rawFileIds: unknown,
) {
  const parsed = failedUploadCleanupSchema.safeParse({
    albumId: rawAlbumId,
    fileIds: rawFileIds,
  });
  if (!parsed.success) return { error: "Upload cleanup request is invalid." };

  const user = await requireDbUser();
  const album = await prisma.album.findFirst({
    where: { id: parsed.data.albumId, ownerId: user.id },
    select: { id: true },
  });
  if (!album) return { error: "Album not found or unauthorized" };

  const [photos, assets] = await Promise.all([
    prisma.photo.findMany({
      where: {
        albumId: album.id,
        imagekitFileId: { in: parsed.data.fileIds },
      },
      select: { imagekitFileId: true },
    }),
    prisma.albumAsset.findMany({
      where: {
        albumId: album.id,
        imagekitFileId: { in: parsed.data.fileIds },
      },
      select: { imagekitFileId: true },
    }),
  ]);
  const linkedFiles = new Set([
    ...photos.map((photo) => photo.imagekitFileId),
    ...assets.map((asset) => asset.imagekitFileId),
  ]);
  const unlinkedFiles = parsed.data.fileIds.filter(
    (fileId) => !linkedFiles.has(fileId),
  );
  const cleanupPending = await cleanupAlbumFiles(album.id, unlinkedFiles);
  return { success: cleanupPending === 0, cleanupPending };
}

export async function deletePhotoAction(
  rawAlbumId: unknown,
  rawPhotoId: unknown,
) {
  const albumIdResult = albumIdSchema.safeParse(rawAlbumId);
  const photoIdResult = photoIdSchema.safeParse(rawPhotoId);
  if (!albumIdResult.success || !photoIdResult.success) {
    return { error: "Photo details are invalid." };
  }
  const albumId = albumIdResult.data;
  const photoId = photoIdResult.data;
  const user = await requireDbUser();
  const album = await prisma.album.findFirst({
    where: { id: albumId, ownerId: user.id },
    select: { id: true, shareSlug: true, coverPhotoId: true },
  });
  if (!album) return { error: "Album not found or unauthorized" };

  const photo = await prisma.photo.findFirst({
    where: { id: photoId, albumId },
    select: { id: true, imagekitFileId: true },
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

  let cleanupPending = false;
  try {
    await deleteImageKitFileFromAlbum(albumId, photo.imagekitFileId);
  } catch (error) {
    cleanupPending = true;
    console.error("Deleted photo could not be removed from ImageKit", {
      error: error instanceof Error ? error.name : "UnknownError",
    });
  }

  revalidatePath(`/dashboard/albums/${albumId}`);
  revalidatePath("/dashboard");
  revalidatePath(`/a/${album.shareSlug}`);
  return { success: true, cleanupPending };
}

export async function setAlbumCoverAction(
  rawAlbumId: unknown,
  rawPhotoId: unknown,
) {
  const albumIdResult = albumIdSchema.safeParse(rawAlbumId);
  const photoIdResult = photoIdSchema.safeParse(rawPhotoId);
  if (!albumIdResult.success || !photoIdResult.success) {
    return { error: "Photo details are invalid." };
  }
  const albumId = albumIdResult.data;
  const photoId = photoIdResult.data;
  const user = await requireDbUser();
  const photo = await prisma.photo.findFirst({
    where: {
      id: photoId,
      albumId,
      album: { ownerId: user.id },
      mimeType: { startsWith: "image/" },
    },
    select: { album: { select: { shareSlug: true } } },
  });
  if (!photo) return { error: "Photo not found or unauthorized" };

  await prisma.album.updateMany({
    where: { id: albumId, ownerId: user.id },
    data: { coverPhotoId: photoId },
  });
  revalidatePath(`/dashboard/albums/${albumId}`);
  revalidatePath("/dashboard");
  revalidatePath(`/a/${photo.album.shareSlug}`);
  return { success: true };
}

export async function updatePhotoCaptionAction(
  rawAlbumId: unknown,
  rawPhotoId: unknown,
  rawCaption: unknown,
) {
  const albumIdResult = albumIdSchema.safeParse(rawAlbumId);
  const photoIdResult = photoIdSchema.safeParse(rawPhotoId);
  const captionResult = z.string().max(500).safeParse(rawCaption);
  if (!albumIdResult.success || !photoIdResult.success || !captionResult.success) {
    return { error: "Caption must be 500 characters or fewer." };
  }
  const albumId = albumIdResult.data;
  const user = await requireDbUser();
  const updated = await prisma.photo.updateMany({
    where: {
      id: photoIdResult.data,
      albumId,
      album: { ownerId: user.id },
    },
    data: { caption: captionResult.data.trim() || null },
  });
  if (updated.count === 0) return { error: "Photo not found or unauthorized" };

  revalidatePath(`/dashboard/albums/${albumId}`);
  return { success: true };
}

export async function togglePhotoFavoriteAction(
  rawPhotoId: unknown,
  rawGuestName?: unknown,
) {
  const photoIdResult = photoIdSchema.safeParse(rawPhotoId);
  const guestNameResult = z.string().trim().max(80).optional().safeParse(rawGuestName);
  if (!photoIdResult.success || !guestNameResult.success) {
    return { error: "Favorite details are invalid." };
  }

  const photo = await prisma.photo.findUnique({
    where: { id: photoIdResult.data },
    select: accessiblePhotoSelect,
  });
  if (
    !photo ||
    (await getAlbumAccessDecision(photo.album)) !== "allowed"
  ) {
    return { error: "Photo not found or unavailable." };
  }
  const guestId = await getGuestSessionId();
  const uniqueKey = { photoId: photo.id, guestId };
  const existing = await prisma.albumFavorite.findUnique({
    where: { photoId_guestId: uniqueKey },
    select: { id: true },
  });
  if (existing) {
    await prisma.albumFavorite.delete({ where: { id: existing.id } });
    return { success: true, isFavorited: false };
  }

  await prisma.albumFavorite.create({
    data: {
      ...uniqueKey,
      guestName: guestNameResult.data?.trim() || null,
    },
  });
  return { success: true, isFavorited: true };
}

export async function getGuestFavoritesAction(rawPhotoIds: unknown) {
  const parsed = guestFavoriteSchema.safeParse({ photoIds: rawPhotoIds });
  if (!parsed.success || parsed.data.photoIds.length === 0) return [];

  const photoIds = [...new Set(parsed.data.photoIds)];
  const photos = await prisma.photo.findMany({
    where: { id: { in: photoIds } },
    select: accessiblePhotoSelect,
  });
  if (
    photos.length !== photoIds.length ||
    new Set(photos.map((photo) => photo.album.id)).size !== 1 ||
    !photos[0] ||
    (await getAlbumAccessDecision(photos[0].album)) !== "allowed"
  ) {
    return [];
  }

  const guestId = await getGuestSessionId();
  const favorites = await prisma.albumFavorite.findMany({
    where: { guestId, photoId: { in: photoIds } },
    select: { photoId: true },
  });
  return favorites.map((favorite) => favorite.photoId);
}
