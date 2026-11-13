CREATE TABLE "AlbumPasswordAttempt" (
    "id" TEXT NOT NULL,
    "albumId" TEXT NOT NULL,
    "clientKey" TEXT NOT NULL,
    "failedAttempts" INTEGER NOT NULL DEFAULT 0,
    "windowStartedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedUntil" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AlbumPasswordAttempt_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AlbumPasswordAttempt_albumId_clientKey_key"
    ON "AlbumPasswordAttempt"("albumId", "clientKey");
CREATE INDEX "AlbumPasswordAttempt_lockedUntil_idx"
    ON "AlbumPasswordAttempt"("lockedUntil");
CREATE INDEX "AlbumFavorite_guestId_photoId_idx"
    ON "AlbumFavorite"("guestId", "photoId");

ALTER TABLE "AlbumPasswordAttempt"
    ADD CONSTRAINT "AlbumPasswordAttempt_albumId_fkey"
    FOREIGN KEY ("albumId") REFERENCES "Album"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Photo"
    ADD COLUMN "isPrivate" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "AlbumAsset"
    ADD COLUMN "isPrivate" BOOLEAN NOT NULL DEFAULT false;
