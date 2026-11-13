import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  albumFindUnique: vi.fn(),
  photoFindFirst: vi.fn(),
  photoFindMany: vi.fn(),
  getAlbumAccessDecision: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    album: { findUnique: mocks.albumFindUnique },
    photo: {
      findFirst: mocks.photoFindFirst,
      findMany: mocks.photoFindMany,
    },
  },
}));
vi.mock("@/lib/album-access", () => ({
  getAlbumAccessDecision: mocks.getAlbumAccessDecision,
}));

import { GET } from "@/app/api/albums/[album]/photos/route";
import {
  decodeGalleryCursor,
  encodeGalleryCursor,
  GALLERY_PAGE_SIZE,
} from "@/lib/gallery-pagination";

const album = {
  id: "album-a",
  visibility: "UNLISTED",
  expiresAt: null,
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  owner: { clerkId: "owner-a" },
};

function photo(id: string, sortOrder: number) {
  return {
    id,
    caption: null,
    width: 100,
    height: 100,
    sizeBytes: 10,
    mimeType: "image/jpeg",
    sortOrder,
  };
}

function getPhotos(cursor?: string) {
  const url = new URL("https://album.test/api/albums/share-a/photos");
  if (cursor) url.searchParams.set("cursor", cursor);
  return GET(new Request(url), {
    params: Promise.resolve({ album: "share-a" }),
  });
}

describe("access-checked gallery pagination", () => {
  beforeEach(() => {
    mocks.albumFindUnique.mockResolvedValue(album);
    mocks.photoFindFirst.mockResolvedValue({ id: "cursor-a" });
    mocks.photoFindMany.mockResolvedValue([]);
    mocks.getAlbumAccessDecision.mockResolvedValue("allowed");
  });

  afterEach(() => vi.clearAllMocks());

  it("returns a bounded first page and a deterministic next cursor", async () => {
    mocks.photoFindMany.mockResolvedValue(
      Array.from({ length: GALLERY_PAGE_SIZE + 1 }, (_, index) =>
        photo(`photo-${index}`, index),
      ),
    );
    const response = await getPhotos();
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.photos).toHaveLength(GALLERY_PAGE_SIZE);
    expect(decodeGalleryCursor(body.nextCursor)).toEqual({
      id: `photo-${GALLERY_PAGE_SIZE - 1}`,
      sortOrder: GALLERY_PAGE_SIZE - 1,
    });
    expect(mocks.photoFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        take: GALLERY_PAGE_SIZE + 1,
        orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
      }),
    );
  });

  it("uses a keyset fallback when the cursor photo was deleted", async () => {
    mocks.photoFindFirst.mockResolvedValue(null);
    mocks.photoFindMany.mockResolvedValue([photo("photo-next", 8)]);
    const cursor = encodeGalleryCursor({ id: "deleted-photo", sortOrder: 7 });
    const response = await getPhotos(cursor);
    expect(response.status).toBe(200);
    expect(mocks.photoFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          albumId: "album-a",
          OR: [
            { sortOrder: { gt: 7 } },
            { sortOrder: 7, id: { gt: "deleted-photo" } },
          ],
        },
      }),
    );
  });

  it.each(["private", "expired", "password-required"])(
    "does not paginate an album with %s access",
    async (decision) => {
      mocks.getAlbumAccessDecision.mockResolvedValue(decision);
      const response = await getPhotos();
      expect(response.status).toBe(decision === "password-required" ? 403 : 404);
      expect(mocks.photoFindMany).not.toHaveBeenCalled();
    },
  );

  it("rejects malformed cursors before loading gallery photos", async () => {
    const response = await getPhotos("malformed");
    expect(response.status).toBe(400);
    expect(mocks.photoFindMany).not.toHaveBeenCalled();
  });
});
