import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";

export async function enqueueMediaCleanup(
  tx: Prisma.TransactionClient,
  albumId: string,
  imagekitFileId: string,
) {
  await tx.mediaCleanupJob.upsert({
    where: { imagekitFileId },
    create: { albumId, imagekitFileId },
    update: {},
  });
}

export async function enqueueUnlinkedMediaCleanup(
  albumId: string,
  fileIds: string[],
) {
  const uniqueIds = [...new Set(fileIds)];
  if (uniqueIds.length === 0) return;
  await prisma.$transaction(async (tx) => {
    for (const imagekitFileId of uniqueIds) {
      const [photo, asset] = await Promise.all([
        tx.photo.findUnique({
          where: { imagekitFileId },
          select: { id: true },
        }),
        tx.albumAsset.findUnique({
          where: { imagekitFileId },
          select: { id: true },
        }),
      ]);
      if (!photo && !asset) {
        await enqueueMediaCleanup(tx, albumId, imagekitFileId);
      }
    }
  });
}
