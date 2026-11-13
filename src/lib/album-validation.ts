import "server-only";

import type { Prisma } from "@/generated/prisma/client";

type PhotoLookup = Pick<Prisma.TransactionClient, "photo">;

export async function albumImageCoverExists(
  db: PhotoLookup,
  albumId: string,
  ownerId: string,
  photoId: string,
) {
  const photo = await db.photo.findFirst({
    where: {
      id: photoId,
      albumId,
      mimeType: { startsWith: "image/" },
      album: { ownerId },
    },
    select: { id: true },
  });
  return photo !== null;
}
