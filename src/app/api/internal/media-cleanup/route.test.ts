import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  cleanupFindMany: vi.fn(),
  cleanupUpdateMany: vi.fn(),
  cleanupUpdate: vi.fn(),
  photoFindUnique: vi.fn(),
  assetFindUnique: vi.fn(),
  deleteImageKitFileFromAlbum: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    mediaCleanupJob: {
      findMany: mocks.cleanupFindMany,
      updateMany: mocks.cleanupUpdateMany,
      update: mocks.cleanupUpdate,
    },
    photo: { findUnique: mocks.photoFindUnique },
    albumAsset: { findUnique: mocks.assetFindUnique },
  },
}));
vi.mock("@/lib/imagekit-server", () => ({
  deleteImageKitFileFromAlbum: mocks.deleteImageKitFileFromAlbum,
}));

import { GET, POST } from "@/app/api/internal/media-cleanup/route";

const job = {
  id: "job-a",
  albumId: "album-a",
  imagekitFileId: "file-a",
  attempts: 0,
};

describe("media cleanup worker", () => {
  beforeEach(() => {
    vi.stubEnv("CRON_SECRET", "test-cron-secret");
    mocks.cleanupFindMany.mockResolvedValue([job]);
    mocks.cleanupUpdateMany.mockResolvedValue({ count: 1 });
    mocks.cleanupUpdate.mockResolvedValue(job);
    mocks.photoFindUnique.mockResolvedValue(null);
    mocks.assetFindUnique.mockResolvedValue(null);
    mocks.deleteImageKitFileFromAlbum.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it("rejects requests without the cleanup bearer secret", async () => {
    const response = await GET(new Request("https://album.test/api/internal/media-cleanup"));
    expect(response.status).toBe(401);
    expect(mocks.cleanupFindMany).not.toHaveBeenCalled();
  });

  it("deletes unreferenced media and marks its durable job complete", async () => {
    const response = await GET(
      new Request("https://album.test/api/internal/media-cleanup", {
        headers: { authorization: "Bearer test-cron-secret" },
      }),
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ claimed: 1, completed: 1 });
    expect(mocks.deleteImageKitFileFromAlbum).toHaveBeenCalledWith(
      "album-a",
      "file-a",
    );
    expect(mocks.cleanupUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "job-a" },
        data: expect.objectContaining({ status: "COMPLETED" }),
      }),
    );
  });

  it("does not delete an asset that is still referenced", async () => {
    mocks.photoFindUnique.mockResolvedValue({ id: "photo-a" });
    const response = await GET(
      new Request("https://album.test/api/internal/media-cleanup", {
        headers: { authorization: "Bearer test-cron-secret" },
      }),
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ claimed: 1, completed: 0 });
    expect(mocks.deleteImageKitFileFromAlbum).not.toHaveBeenCalled();
  });

  it("retries only failed jobs requested by an authorized operator", async () => {
    const response = await POST(
      new Request("https://album.test/api/internal/media-cleanup", {
        method: "POST",
        headers: {
          authorization: "Bearer test-cron-secret",
          "content-type": "application/json",
        },
        body: JSON.stringify({ retryJobIds: ["job-a"] }),
      }),
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ retried: 1 });
    expect(mocks.cleanupUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: { in: ["job-a"] }, status: "FAILED" },
        data: expect.objectContaining({ attempts: 0, processingAt: null }),
      }),
    );
  });
});
