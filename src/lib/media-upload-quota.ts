import "server-only";

import { prisma } from "@/lib/db";
import {
  DAILY_UPLOAD_BYTE_LIMIT,
  DAILY_UPLOAD_FILE_LIMIT,
} from "@/lib/media-upload-policy";

function utcDay(now: Date) {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
}

export async function reserveMediaUpload(
  userId: string,
  bytes: number,
  now = new Date(),
) {
  if (!Number.isSafeInteger(bytes) || bytes <= 0) return false;
  const day = utcDay(now);
  const amount = BigInt(bytes);

  return prisma.$transaction(
    async (tx) => {
      await tx.mediaUploadQuota.upsert({
        where: { userId_day: { userId, day } },
        create: { userId, day },
        update: {},
      });
      const reserved = await tx.mediaUploadQuota.updateMany({
        where: {
          userId,
          day,
          fileCount: { lt: DAILY_UPLOAD_FILE_LIMIT },
          bytes: { lte: DAILY_UPLOAD_BYTE_LIMIT - amount },
        },
        data: {
          fileCount: { increment: 1 },
          bytes: { increment: amount },
        },
      });
      return reserved.count === 1;
    },
    { isolationLevel: "Serializable" },
  );
}

export async function releaseMediaUploadReservation(
  userId: string,
  reservedBytes: number,
  now = new Date(),
) {
  await prisma.mediaUploadQuota.updateMany({
    where: { userId, day: utcDay(now), fileCount: { gt: 0 } },
    data: {
      fileCount: { decrement: 1 },
      bytes: { decrement: BigInt(reservedBytes) },
    },
  });
}

export async function adjustMediaUploadReservation(
  userId: string,
  reservedBytes: number,
  actualBytes: number,
  now = new Date(),
) {
  await prisma.mediaUploadQuota.updateMany({
    where: { userId, day: utcDay(now) },
    data: { bytes: { decrement: BigInt(reservedBytes - actualBytes) } },
  });
}
