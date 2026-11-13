import "server-only";

import { createHmac } from "node:crypto";

import { prisma } from "@/lib/db";

const WINDOW_MILLISECONDS = 15 * 60 * 1000;
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MILLISECONDS = 15 * 60 * 1000;

export function hashPasswordAttemptKey(address: string, secret: string) {
  return createHmac("sha256", secret)
    .update("my-album:password-attempt:v1:")
    .update(address)
    .digest("hex");
}

export async function isPasswordAttemptLocked(
  albumId: string,
  clientKey: string,
  now = new Date(),
) {
  const attempt = await prisma.albumPasswordAttempt.findUnique({
    where: { albumId_clientKey: { albumId, clientKey } },
    select: { lockedUntil: true },
  });
  return Boolean(attempt?.lockedUntil && attempt.lockedUntil > now);
}

export async function recordFailedPasswordAttempt(
  albumId: string,
  clientKey: string,
  now = new Date(),
) {
  const previous = await prisma.albumPasswordAttempt.findUnique({
    where: { albumId_clientKey: { albumId, clientKey } },
    select: { failedAttempts: true, windowStartedAt: true },
  });
  const resetWindow =
    !previous ||
    now.getTime() - previous.windowStartedAt.getTime() >= WINDOW_MILLISECONDS;

  const attempt = await prisma.albumPasswordAttempt.upsert({
    where: { albumId_clientKey: { albumId, clientKey } },
    create: {
      albumId,
      clientKey,
      failedAttempts: 1,
      windowStartedAt: now,
    },
    update: resetWindow
      ? { failedAttempts: 1, windowStartedAt: now, lockedUntil: null }
      : { failedAttempts: { increment: 1 } },
    select: { id: true, failedAttempts: true },
  });

  if (attempt.failedAttempts >= MAX_FAILED_ATTEMPTS) {
    await prisma.albumPasswordAttempt.update({
      where: { id: attempt.id },
      data: { lockedUntil: new Date(now.getTime() + LOCKOUT_MILLISECONDS) },
    });
  }
}

export async function clearPasswordAttempts(albumId: string, clientKey: string) {
  await prisma.albumPasswordAttempt.deleteMany({
    where: { albumId, clientKey },
  });
}
