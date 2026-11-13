"use server";

import crypto from "node:crypto";
import { cookies, headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireDbUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { AlbumVisibility } from "@/generated/prisma/enums";
import { hashAlbumPassword, verifyAlbumPassword } from "@/lib/album-password";
import {
  clearPasswordAttempts,
  hashPasswordAttemptKey,
  isPasswordAttemptLocked,
  recordFailedPasswordAttempt,
} from "@/lib/album-password-rate-limit";
import { deleteImageKitFileFromAlbum } from "@/lib/imagekit-server";
import {
  albumAccessCookieName,
  createAlbumAccessToken,
} from "@/lib/album-token";

const albumIdSchema = z.string().trim().min(1).max(128);
const newPasswordSchema = z.string().min(8).max(128);
const dateSchema = z
  .string()
  .datetime({ offset: true })
  .nullable()
  .optional();
const albumFields = {
  title: z.string().trim().min(1).max(120),
  description: z.string().max(5000).optional(),
  visibility: z.nativeEnum(AlbumVisibility).optional(),
  password: newPasswordSchema.optional(),
  allowDownload: z.boolean().optional(),
  expiresAt: dateSchema,
};

const createAlbumSchema = z
  .object(albumFields)
  .strict()
  .refine(
    (input) =>
      input.visibility !== AlbumVisibility.PASSWORD ||
      Boolean(input.password?.trim()),
    { message: "Password is required for password-protected albums" },
  );

const updateAlbumSchema = z
  .object({
    ...albumFields,
    coverPhotoId: z.string().trim().min(1).max(128).nullable().optional(),
  })
  .strict();

const passwordCheckSchema = z.object({
  shareSlug: z.string().trim().min(1).max(100),
  password: z.string().min(1).max(128),
});

function generateSlug(title: string): string {
  const base = title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 30);
  const randomSuffix = crypto.randomBytes(3).toString("hex");
  return base ? `${base}-${randomSuffix}` : `album-${randomSuffix}`;
}

export type CreateAlbumInput = {
  title: string;
  description?: string;
  visibility?: AlbumVisibility;
  password?: string;
  allowDownload?: boolean;
  expiresAt?: string | null;
};

export async function createAlbumAction(rawInput: unknown) {
  const parsed = createAlbumSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Album details are invalid." };
  }
  const input = parsed.data;
  const user = await requireDbUser();

  const visibility = input.visibility ?? AlbumVisibility.UNLISTED;
  const passwordHash =
    visibility === AlbumVisibility.PASSWORD
      ? await hashAlbumPassword(input.password!)
      : null;

  let shareSlug = generateSlug(input.title);
  for (let attempts = 0; attempts < 5; attempts++) {
    const existing = await prisma.album.findUnique({
      where: { shareSlug },
      select: { id: true },
    });
    if (!existing) break;
    shareSlug = generateSlug(input.title);
  }

  const album = await prisma.album.create({
    data: {
      ownerId: user.id,
      title: input.title,
      description: input.description?.trim() || null,
      shareSlug,
      visibility,
      passwordHash,
      allowDownload: input.allowDownload ?? true,
      expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
    },
    select: { id: true, shareSlug: true },
  });

  revalidatePath("/dashboard");
  return { success: true, albumId: album.id, shareSlug: album.shareSlug };
}

export type UpdateAlbumInput = {
  title?: string;
  description?: string;
  visibility?: AlbumVisibility;
  password?: string;
  allowDownload?: boolean;
  coverPhotoId?: string | null;
  expiresAt?: string | null;
};

export async function updateAlbumAction(
  rawAlbumId: unknown,
  rawInput: unknown,
) {
  const albumIdResult = albumIdSchema.safeParse(rawAlbumId);
  const parsed = updateAlbumSchema.safeParse(rawInput);
  if (!albumIdResult.success || !parsed.success) {
    return { error: "Album details are invalid." };
  }
  const albumId = albumIdResult.data;
  const input = parsed.data;
  const user = await requireDbUser();

  const existing = await prisma.album.findFirst({
    where: { id: albumId, ownerId: user.id },
    select: { id: true, passwordHash: true },
  });
  if (!existing) {
    return { error: "Album not found or you do not have permission to edit it" };
  }

  const updateData: {
    title?: string;
    description?: string | null;
    visibility?: AlbumVisibility;
    passwordHash?: string | null;
    allowDownload?: boolean;
    coverPhotoId?: string | null;
    expiresAt?: Date | null;
  } = {};

  if (input.title !== undefined) updateData.title = input.title;
  if (input.description !== undefined) {
    updateData.description = input.description.trim() || null;
  }

  if (input.visibility !== undefined) {
    updateData.visibility = input.visibility;
    if (input.visibility !== AlbumVisibility.PASSWORD) {
      updateData.passwordHash = null;
    } else if (input.password) {
      updateData.passwordHash = await hashAlbumPassword(input.password);
    } else if (!existing.passwordHash) {
      return { error: "Please provide a password for the password-protected album." };
    }
  } else if (input.password) {
    return { error: "A password can only be changed on a password-protected album." };
  }

  if (input.allowDownload !== undefined) {
    updateData.allowDownload = input.allowDownload;
  }

  if (input.coverPhotoId !== undefined) {
    if (input.coverPhotoId !== null) {
      const coverPhoto = await prisma.photo.findFirst({
        where: { id: input.coverPhotoId, albumId },
        select: { id: true },
      });
      if (!coverPhoto) {
        return { error: "Cover photo must belong to this album" };
      }
    }
    updateData.coverPhotoId = input.coverPhotoId;
  }

  if (input.expiresAt !== undefined) {
    updateData.expiresAt = input.expiresAt ? new Date(input.expiresAt) : null;
  }

  const updated = await prisma.album.updateMany({
    where: { id: albumId, ownerId: user.id },
    data: updateData,
  });
  if (updated.count !== 1) {
    return { error: "Album not found or you do not have permission to edit it" };
  }

  const album = await prisma.album.findUniqueOrThrow({
    where: { id: albumId },
    select: { shareSlug: true },
  });
  revalidatePath("/dashboard");
  revalidatePath(`/dashboard/albums/${albumId}`);
  revalidatePath(`/a/${album.shareSlug}`);
  return { success: true };
}

export async function deleteAlbumAction(rawAlbumId: unknown) {
  const albumIdResult = albumIdSchema.safeParse(rawAlbumId);
  if (!albumIdResult.success) return { error: "Album ID is invalid." };
  const user = await requireDbUser();

  const albumId = albumIdResult.data;
  const deletedAlbum = await prisma.$transaction(
    async (tx) => {
      const album = await tx.album.findFirst({
        where: { id: albumId, ownerId: user.id },
        select: {
          id: true,
          photos: { select: { imagekitFileId: true } },
          assets: { select: { imagekitFileId: true } },
        },
      });
      if (!album) return null;
      await tx.album.delete({ where: { id: album.id } });
      return [
        ...album.photos.map((photo) => photo.imagekitFileId),
        ...album.assets.map((asset) => asset.imagekitFileId),
      ];
    },
    { isolationLevel: "Serializable" },
  );
  if (!deletedAlbum) {
    return { error: "Album not found or unauthorized" };
  }

  const cleanupResults = await Promise.allSettled(
    deletedAlbum.map((fileId) => deleteImageKitFileFromAlbum(albumId, fileId)),
  );
  const cleanupPending = cleanupResults.filter(
    (result) => result.status === "rejected",
  ).length;
  if (cleanupPending > 0) {
    console.error("Deleted album media cleanup failed", {
      albumId,
      cleanupPending,
    });
  }

  revalidatePath("/dashboard");
  return { success: true, cleanupPending };
}

export async function verifyAlbumPasswordAction(
  rawShareSlug: unknown,
  rawPassword: unknown,
) {
  const parsed = passwordCheckSchema.safeParse({
    shareSlug: rawShareSlug,
    password: rawPassword,
  });
  if (!parsed.success) {
    return { error: "Unable to unlock this album. Check the password and try again." };
  }

  const album = await prisma.album.findUnique({
    where: { shareSlug: parsed.data.shareSlug },
    select: {
      id: true,
      visibility: true,
      passwordHash: true,
      updatedAt: true,
    },
  });
  if (
    !album ||
    album.visibility !== AlbumVisibility.PASSWORD ||
    !album.passwordHash
  ) {
    return { error: "Unable to unlock this album. Check the password and try again." };
  }

  const secret = process.env.CLERK_SECRET_KEY;
  if (!secret) throw new Error("CLERK_SECRET_KEY is not configured");
  const requestHeaders = await headers();
  const address =
    requestHeaders.get("x-real-ip") ??
    requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown";
  const clientKey = hashPasswordAttemptKey(address, secret);
  if (await isPasswordAttemptLocked(album.id, clientKey)) {
    return { error: "Unable to unlock this album. Check the password and try again." };
  }

  const result = await verifyAlbumPassword(parsed.data.password, album.passwordHash);
  if (!result.valid) {
    await recordFailedPasswordAttempt(album.id, clientKey);
    return { error: "Unable to unlock this album. Check the password and try again." };
  }

  let revision = album.updatedAt.getTime();
  if (result.needsUpgrade) {
    const newHash = await hashAlbumPassword(parsed.data.password);
    const upgraded = await prisma.album.updateMany({
      where: { id: album.id, passwordHash: album.passwordHash },
      data: { passwordHash: newHash },
    });
    if (upgraded.count !== 1) {
      return { error: "Unable to unlock this album. Check the password and try again." };
    }
    const freshAlbum = await prisma.album.findUnique({
      where: { id: album.id },
      select: { updatedAt: true, visibility: true },
    });
    if (!freshAlbum || freshAlbum.visibility !== AlbumVisibility.PASSWORD) {
      return { error: "Unable to unlock this album. Check the password and try again." };
    }
    revision = freshAlbum.updatedAt.getTime();
  }

  await clearPasswordAttempts(album.id, clientKey);
  const cookieStore = await cookies();
  cookieStore.set(
    albumAccessCookieName(album.id),
    createAlbumAccessToken(album.id, revision, secret),
    {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 12 * 60 * 60,
    },
  );
  revalidatePath(`/a/${parsed.data.shareSlug}`);
  return { success: true };
}
