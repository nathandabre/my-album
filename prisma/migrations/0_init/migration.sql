-- Baseline for the Prisma schema that existed before migration tracking.
-- Existing databases must be verified against this schema before marking it applied.
CREATE SCHEMA IF NOT EXISTS "public";

CREATE TYPE "AlbumVisibility" AS ENUM ('PRIVATE', 'UNLISTED', 'PASSWORD');
CREATE TYPE "AlbumAssetType" AS ENUM ('IMAGE', 'VIDEO');

CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "clerkId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "imageUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Album" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "coverPhotoId" TEXT,
    "shareSlug" TEXT NOT NULL,
    "visibility" "AlbumVisibility" NOT NULL DEFAULT 'UNLISTED',
    "passwordHash" TEXT,
    "allowDownload" BOOLEAN NOT NULL DEFAULT false,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Album_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AlbumPage" (
    "id" TEXT NOT NULL,
    "albumId" TEXT NOT NULL,
    "title" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "width" INTEGER NOT NULL DEFAULT 1200,
    "height" INTEGER NOT NULL DEFAULT 1600,
    "designJson" JSONB NOT NULL,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AlbumPage_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AlbumAsset" (
    "id" TEXT NOT NULL,
    "albumId" TEXT NOT NULL,
    "imagekitFileId" TEXT NOT NULL,
    "filePath" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "type" "AlbumAssetType" NOT NULL,
    "width" INTEGER NOT NULL DEFAULT 0,
    "height" INTEGER NOT NULL DEFAULT 0,
    "sizeBytes" INTEGER NOT NULL,
    "renderedPageId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AlbumAsset_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Photo" (
    "id" TEXT NOT NULL,
    "albumId" TEXT NOT NULL,
    "imagekitFileId" TEXT NOT NULL,
    "filePath" TEXT NOT NULL,
    "caption" TEXT,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Photo_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AlbumFavorite" (
    "id" TEXT NOT NULL,
    "photoId" TEXT NOT NULL,
    "guestId" TEXT NOT NULL,
    "guestName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AlbumFavorite_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "User_clerkId_key" ON "User"("clerkId");
CREATE UNIQUE INDEX "Album_coverPhotoId_key" ON "Album"("coverPhotoId");
CREATE UNIQUE INDEX "Album_shareSlug_key" ON "Album"("shareSlug");
CREATE INDEX "Album_ownerId_createdAt_idx" ON "Album"("ownerId", "createdAt");
CREATE INDEX "AlbumPage_albumId_sortOrder_idx" ON "AlbumPage"("albumId", "sortOrder");
CREATE UNIQUE INDEX "AlbumAsset_imagekitFileId_key" ON "AlbumAsset"("imagekitFileId");
CREATE UNIQUE INDEX "AlbumAsset_renderedPageId_key" ON "AlbumAsset"("renderedPageId");
CREATE INDEX "AlbumAsset_albumId_createdAt_idx" ON "AlbumAsset"("albumId", "createdAt");
CREATE UNIQUE INDEX "Photo_imagekitFileId_key" ON "Photo"("imagekitFileId");
CREATE INDEX "Photo_albumId_sortOrder_idx" ON "Photo"("albumId", "sortOrder");
CREATE INDEX "AlbumFavorite_photoId_idx" ON "AlbumFavorite"("photoId");
CREATE UNIQUE INDEX "AlbumFavorite_photoId_guestId_key" ON "AlbumFavorite"("photoId", "guestId");

ALTER TABLE "Album"
    ADD CONSTRAINT "Album_ownerId_fkey"
    FOREIGN KEY ("ownerId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Album"
    ADD CONSTRAINT "Album_coverPhotoId_fkey"
    FOREIGN KEY ("coverPhotoId") REFERENCES "Photo"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AlbumPage"
    ADD CONSTRAINT "AlbumPage_albumId_fkey"
    FOREIGN KEY ("albumId") REFERENCES "Album"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AlbumAsset"
    ADD CONSTRAINT "AlbumAsset_albumId_fkey"
    FOREIGN KEY ("albumId") REFERENCES "Album"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AlbumAsset"
    ADD CONSTRAINT "AlbumAsset_renderedPageId_fkey"
    FOREIGN KEY ("renderedPageId") REFERENCES "AlbumPage"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Photo"
    ADD CONSTRAINT "Photo_albumId_fkey"
    FOREIGN KEY ("albumId") REFERENCES "Album"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AlbumFavorite"
    ADD CONSTRAINT "AlbumFavorite_photoId_fkey"
    FOREIGN KEY ("photoId") REFERENCES "Photo"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
