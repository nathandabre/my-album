import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

const databaseUrl = process.env.TEST_DATABASE_URL;
const allowedTestHosts = new Set(["localhost", "127.0.0.1", "::1", "postgres"]);
const enabled = Boolean(databaseUrl);

describe.skipIf(!enabled)("PostgreSQL integration safety and data integrity", () => {
  let prisma: typeof import("@/lib/db").prisma;
  const createdUsers: string[] = [];

  beforeAll(async () => {
    const url = new URL(databaseUrl!);
    if (!allowedTestHosts.has(url.hostname)) {
      throw new Error(
        "TEST_DATABASE_URL must point to a local/CI PostgreSQL test service.",
      );
    }
    process.env.DATABASE_URL = databaseUrl;
    ({ prisma } = await import("@/lib/db"));
  });

  afterEach(async () => {
    if (createdUsers.length > 0) {
      await prisma.user.deleteMany({
        where: { id: { in: createdUsers.splice(0) } },
      });
    }
  });

  afterAll(async () => {
    if (prisma) await prisma.$disconnect();
  });

  async function createFixture() {
    const suffix = randomUUID();
    const user = await prisma.user.create({
      data: {
        clerkId: `integration-${suffix}`,
        email: `${suffix}@integration.invalid`,
      },
    });
    createdUsers.push(user.id);
    const album = await prisma.album.create({
      data: {
        ownerId: user.id,
        title: "Integration album",
        shareSlug: `integration-${suffix}`,
      },
    });
    return { user, album };
  }

  it("rolls back multi-record transactions when a write fails", async () => {
    const { user } = await createFixture();
    const shareSlug = `rollback-${randomUUID()}`;
    await expect(
      prisma.$transaction(async (tx) => {
        await tx.album.create({
          data: { ownerId: user.id, title: "Rolled back", shareSlug },
        });
        throw new Error("force transaction rollback");
      }),
    ).rejects.toThrow("force transaction rollback");
    await expect(
      prisma.album.findUnique({ where: { shareSlug } }),
    ).resolves.toBeNull();
  });

  it("enforces duplicate favorite constraints and cascades user deletion", async () => {
    const { user, album } = await createFixture();
    const photo = await prisma.photo.create({
      data: {
        albumId: album.id,
        imagekitFileId: `file-${randomUUID()}`,
        filePath: `/albums/${album.id}/test.jpg`,
        width: 10,
        height: 10,
        sizeBytes: 3,
        mimeType: "image/jpeg",
      },
    });
    await prisma.albumFavorite.create({
      data: { photoId: photo.id, guestId: "test-guest" },
    });
    await expect(
      prisma.albumFavorite.create({
        data: { photoId: photo.id, guestId: "test-guest" },
      }),
    ).rejects.toMatchObject({ code: "P2002" });
    await prisma.user.delete({ where: { id: user.id } });
    expect(
      await prisma.album.findUnique({ where: { id: album.id } }),
    ).toBeNull();
    expect(
      await prisma.photo.findUnique({ where: { id: photo.id } }),
    ).toBeNull();
  });

  it("does not allow ownership-scoped album mutations to cross user boundaries", async () => {
    const owner = await createFixture();
    const other = await createFixture();
    const result = await prisma.album.updateMany({
      where: { id: owner.album.id, ownerId: other.user.id },
      data: { title: "Impersonated" },
    });
    expect(result.count).toBe(0);
    await expect(
      prisma.album.findUniqueOrThrow({ where: { id: owner.album.id } }),
    ).resolves.toMatchObject({ title: "Integration album" });
  });

  it("switches media pointers and durably queues public originals atomically", async () => {
    const { album } = await createFixture();
    const originalFileId = `public-${randomUUID()}`;
    const replacementFileId = `private-${randomUUID()}`;
    const photo = await prisma.photo.create({
    data: {
      albumId: album.id,
      imagekitFileId: originalFileId,
      filePath: `/albums/${album.id}/original.jpg`,
      width: 10,
      height: 10,
      sizeBytes: 3,
      mimeType: "image/jpeg",
    },
    });

    await prisma.$transaction(async (tx) => {
    await tx.photo.update({
      where: { id: photo.id },
      data: {
        imagekitFileId: replacementFileId,
        filePath: `/albums/${album.id}/private-${photo.id}.jpg`,
        isPrivate: true,
      },
    });
    await tx.mediaCleanupJob.upsert({
      where: { imagekitFileId: originalFileId },
      create: { albumId: album.id, imagekitFileId: originalFileId },
      update: {},
    });
    });

    await expect(
    prisma.photo.findUnique({ where: { id: photo.id } }),
    ).resolves.toMatchObject({
    imagekitFileId: replacementFileId,
    isPrivate: true,
    });
    await expect(
    prisma.mediaCleanupJob.findUnique({
      where: { imagekitFileId: originalFileId },
    }),
    ).resolves.toMatchObject({ status: "PENDING" });
  });
});
