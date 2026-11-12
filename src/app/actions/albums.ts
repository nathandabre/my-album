"use server";

import crypto from "node:crypto";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";

import { requireDbUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { AlbumVisibility } from "@/generated/prisma/enums";

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

function hashPassword(plainText: string): string {
  return crypto.createHash("sha256").update(plainText.trim()).digest("hex");
}


export type CreateAlbumInput = {
  title: string;
  description?: string;
  visibility?: AlbumVisibility;
  password?: string;
  allowDownload?: boolean;
  expiresAt?: string | null;
};

export async function createAlbumAction(input: CreateAlbumInput) {
  const user = await requireDbUser();

  const title = input.title?.trim();
  if (!title) {
    return { error: "Album title is required" };
  }

  const visibility = input.visibility ?? AlbumVisibility.UNLISTED;
  let passwordHash: string | null = null;

  if (visibility === AlbumVisibility.PASSWORD) {
    if (!input.password?.trim()) {
      return { error: "Password is required for password-protected albums" };
    }
    passwordHash = hashPassword(input.password);
  }

  let shareSlug = generateSlug(title);
  // Ensure slug uniqueness
  let attempts = 0;
  while (attempts < 5) {
    const existing = await prisma.album.findUnique({
      where: { shareSlug },
      select: { id: true },
    });
    if (!existing) break;
    shareSlug = generateSlug(title);
    attempts++;
  }

  const album = await prisma.album.create({
    data: {
      ownerId: user.id,
      title,
      description: input.description?.trim() || null,
      shareSlug,
      visibility,
      passwordHash,
      allowDownload: input.allowDownload ?? false,
      expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
    },
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
  albumId: string,
  input: UpdateAlbumInput,
) {
  const user = await requireDbUser();

  const existing = await prisma.album.findFirst({
    where: { id: albumId, ownerId: user.id },
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

  if (input.title !== undefined) {
    const title = input.title.trim();
    if (!title) return { error: "Title cannot be empty" };
    updateData.title = title;
  }

  if (input.description !== undefined) {
    updateData.description = input.description.trim() || null;
  }

  if (input.visibility !== undefined) {
    updateData.visibility = input.visibility;
    if (input.visibility === AlbumVisibility.PASSWORD) {
      if (input.password && input.password.trim()) {
        updateData.passwordHash = hashPassword(input.password);
      } else if (!existing.passwordHash) {
        return { error: "Please provide a password for password-protected album" };
      }
    } else {
      updateData.passwordHash = null;
    }
  }

  if (input.allowDownload !== undefined) {
    updateData.allowDownload = input.allowDownload;
  }

  if (input.coverPhotoId !== undefined) {
    updateData.coverPhotoId = input.coverPhotoId;
  }

  if (input.expiresAt !== undefined) {
    updateData.expiresAt = input.expiresAt ? new Date(input.expiresAt) : null;
  }

  const updated = await prisma.album.update({
    where: { id: albumId },
    data: updateData,
  });

  revalidatePath("/dashboard");
  revalidatePath(`/dashboard/albums/${albumId}`);
  revalidatePath(`/a/${updated.shareSlug}`);

  return { success: true };
}

export async function deleteAlbumAction(albumId: string) {
  const user = await requireDbUser();

  const existing = await prisma.album.findFirst({
    where: { id: albumId, ownerId: user.id },
  });

  if (!existing) {
    return { error: "Album not found or unauthorized" };
  }

  await prisma.album.delete({
    where: { id: albumId },
  });

  revalidatePath("/dashboard");
  return { success: true };
}

export async function verifyAlbumPasswordAction(
  shareSlug: string,
  plainPassword: string,
) {
  const album = await prisma.album.findUnique({
    where: { shareSlug },
    select: { id: true, visibility: true, passwordHash: true },
  });

  if (!album) {
    return { error: "Album not found" };
  }

  if (album.visibility !== AlbumVisibility.PASSWORD) {
    return { success: true };
  }

  const hashed = hashPassword(plainPassword);
  if (hashed !== album.passwordHash) {
    return { error: "Incorrect password. Please try again." };
  }

  const cookieStore = await cookies();
  cookieStore.set(`unlocked_${shareSlug}`, "true", {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 7, // 7 days
  });

  return { success: true };
}
