import type { Prisma } from "@/generated/prisma/client";
import { getAlbumAccessDecision } from "@/lib/album-access";
import { prisma } from "@/lib/db";
import {
  decodeGalleryCursor,
  encodeGalleryCursor,
  GALLERY_PAGE_SIZE,
} from "@/lib/gallery-pagination";

type GalleryPhotosRouteProps = {
  params: Promise<{ album: string }>;
};

export async function GET(
  request: Request,
  { params }: GalleryPhotosRouteProps,
) {
  const { album: shareSlug } = await params;
  const rawCursor = new URL(request.url).searchParams.get("cursor");
  const cursor = rawCursor ? decodeGalleryCursor(rawCursor) : null;
  if (rawCursor && !cursor) {
    return Response.json({ error: "Invalid gallery cursor" }, { status: 400 });
  }

  try {
    const album = await prisma.album.findUnique({
      where: { shareSlug },
      select: {
        id: true,
        visibility: true,
        expiresAt: true,
        updatedAt: true,
        owner: { select: { clerkId: true } },
      },
    });
    if (!album) return Response.json({ error: "Not found" }, { status: 404 });

    const access = await getAlbumAccessDecision(album);
    if (access === "private" || access === "expired") {
      return Response.json({ error: "Not found" }, { status: 404 });
    }
    if (access === "password-required") {
      return Response.json({ error: "Password required" }, { status: 403 });
    }

    let where: Prisma.PhotoWhereInput = { albumId: album.id };
    let cursorOptions: { cursor?: { id: string }; skip?: number } = {};
    if (cursor) {
      const cursorExists = await prisma.photo.findFirst({
        where: { id: cursor.id, albumId: album.id },
        select: { id: true },
      });
      if (cursorExists) {
        cursorOptions = { cursor: { id: cursor.id }, skip: 1 };
      } else {
        where = {
          albumId: album.id,
          OR: [
            { sortOrder: { gt: cursor.sortOrder } },
            { sortOrder: cursor.sortOrder, id: { gt: cursor.id } },
          ],
        };
      }
    }

    const results = await prisma.photo.findMany({
      where,
      ...cursorOptions,
      orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
      take: GALLERY_PAGE_SIZE + 1,
      select: {
        id: true,
        caption: true,
        width: true,
        height: true,
        sizeBytes: true,
        mimeType: true,
        sortOrder: true,
      },
    });
    const hasMore = results.length > GALLERY_PAGE_SIZE;
    const photos = results.slice(0, GALLERY_PAGE_SIZE);
    const last = photos.at(-1);
    return Response.json(
      {
        photos: photos.map((photo) => ({
          id: photo.id,
          caption: photo.caption,
          width: photo.width,
          height: photo.height,
          sizeBytes: photo.sizeBytes,
          mimeType: photo.mimeType,
        })),
        nextCursor: hasMore && last ? encodeGalleryCursor(last) : null,
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    console.error("Gallery photo pagination failed", {
      shareSlug,
      errorType: error instanceof Error ? error.name : "UnknownError",
    });
    return Response.json(
      { error: "Unable to load gallery photos" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
