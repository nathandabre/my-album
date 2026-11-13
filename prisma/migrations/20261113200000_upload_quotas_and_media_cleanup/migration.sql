CREATE TYPE "MediaCleanupStatus" AS ENUM (
    'PENDING',
    'PROCESSING',
    'COMPLETED',
    'FAILED'
);
CREATE TYPE "MediaPrivacyMigrationStatus" AS ENUM (
    'PENDING',
    'PROCESSING',
    'COMPLETED',
    'FAILED'
);
CREATE TYPE "MediaPrivacyMigrationSource" AS ENUM ('PHOTO', 'ALBUM_ASSET');

CREATE TABLE "MediaUploadQuota" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "fileCount" INTEGER NOT NULL DEFAULT 0,
    "bytes" BIGINT NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MediaUploadQuota_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MediaUploadQuota_userId_day_key"
    ON "MediaUploadQuota"("userId", "day");

CREATE TABLE "MediaCleanupJob" (
    "id" TEXT NOT NULL,
    "albumId" TEXT NOT NULL,
    "imagekitFileId" TEXT NOT NULL,
    "status" "MediaCleanupStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processingAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MediaCleanupJob_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MediaCleanupJob_imagekitFileId_key"
    ON "MediaCleanupJob"("imagekitFileId");
CREATE INDEX "MediaCleanupJob_status_nextAttemptAt_idx"
    ON "MediaCleanupJob"("status", "nextAttemptAt");

CREATE TABLE "MediaPrivacyMigration" (
    "id" TEXT NOT NULL,
    "sourceFileId" TEXT NOT NULL,
    "sourceRecordId" TEXT NOT NULL,
    "albumId" TEXT NOT NULL,
    "source" "MediaPrivacyMigrationSource" NOT NULL,
    "targetFileId" TEXT,
    "status" "MediaPrivacyMigrationStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MediaPrivacyMigration_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "MediaPrivacyMigration_sourceFileId_key"
    ON "MediaPrivacyMigration"("sourceFileId");
CREATE UNIQUE INDEX "MediaPrivacyMigration_targetFileId_key"
    ON "MediaPrivacyMigration"("targetFileId");
CREATE INDEX "MediaPrivacyMigration_status_updatedAt_idx"
    ON "MediaPrivacyMigration"("status", "updatedAt");

ALTER TABLE "MediaUploadQuota"
    ADD CONSTRAINT "MediaUploadQuota_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
