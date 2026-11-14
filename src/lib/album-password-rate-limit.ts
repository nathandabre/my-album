import "server-only";

import { randomUUID } from "node:crypto";

import { prisma } from "@/lib/db";
import { getAlbumPasswordAttemptKey } from "@/lib/password-attempt-key";

const WINDOW_MILLISECONDS = 15 * 60 * 1000;
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MILLISECONDS = 15 * 60 * 1000;

export { getAlbumPasswordAttemptKey };

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
  await prisma.$executeRaw`
    INSERT INTO "AlbumPasswordAttempt" AS existing
      ("id", "albumId", "clientKey", "failedAttempts", "windowStartedAt", "lockedUntil", "updatedAt")
    VALUES (${randomUUID()}, ${albumId}, ${clientKey}, 1, ${now}, NULL, ${now})
    ON CONFLICT ("albumId", "clientKey") DO UPDATE
    SET
      "failedAttempts" = CASE
        WHEN existing."windowStartedAt" <= EXCLUDED."windowStartedAt" -
          (${WINDOW_MILLISECONDS} * INTERVAL '1 millisecond')
        THEN 1
        ELSE existing."failedAttempts" + 1
      END,
      "windowStartedAt" = CASE
        WHEN existing."windowStartedAt" <= EXCLUDED."windowStartedAt" -
          (${WINDOW_MILLISECONDS} * INTERVAL '1 millisecond')
        THEN EXCLUDED."windowStartedAt"
        ELSE existing."windowStartedAt"
      END,
      "lockedUntil" = CASE
        WHEN (
          CASE
            WHEN existing."windowStartedAt" <= EXCLUDED."windowStartedAt" -
              (${WINDOW_MILLISECONDS} * INTERVAL '1 millisecond')
            THEN 1
            ELSE existing."failedAttempts" + 1
          END
        ) >= ${MAX_FAILED_ATTEMPTS}
        THEN EXCLUDED."windowStartedAt" +
          (${LOCKOUT_MILLISECONDS} * INTERVAL '1 millisecond')
        WHEN existing."windowStartedAt" <= EXCLUDED."windowStartedAt" -
          (${WINDOW_MILLISECONDS} * INTERVAL '1 millisecond')
        THEN NULL
        ELSE existing."lockedUntil"
      END,
      "updatedAt" = EXCLUDED."updatedAt"
  `;
}

export async function clearPasswordAttempts(albumId: string, clientKey: string) {
  await prisma.albumPasswordAttempt.deleteMany({
    where: { albumId, clientKey },
  });
}
