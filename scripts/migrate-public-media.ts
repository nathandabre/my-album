import "dotenv/config";

import { basename, extname } from "node:path";
import ImageKit from "@imagekit/nodejs";
import {
  MediaPrivacyMigrationSource,
  MediaPrivacyMigrationStatus,
} from "@/generated/prisma/enums";
import { prisma } from "@/lib/db";

type MediaRecord = {
  id: string;
  albumId: string;
  imagekitFileId: string;
  filePath: string;
};

type SourceKind =
  | typeof MediaPrivacyMigrationSource.PHOTO
  | typeof MediaPrivacyMigrationSource.ALBUM_ASSET;

const staleJobMilliseconds = 6 * 60 * 60 * 1000;

function cliOptions() {
  const args = new Set(process.argv.slice(2));
  for (const arg of args) {
    if (
      arg !== "--apply" &&
      arg !== "--dry-run" &&
      !arg.startsWith("--limit=") &&
      !arg.startsWith("--batch-size=")
    ) {
      throw new Error(`Unknown option: ${arg}`);
    }
  }
  const value = (name: string, fallback: number) => {
    const arg = process.argv.find((item) => item.startsWith(`${name}=`));
    if (!arg) return fallback;
    const parsed = Number(arg.slice(name.length + 1));
    if (!Number.isSafeInteger(parsed) || parsed < 1) {
      throw new Error(`${name} must be a positive integer`);
    }
    return parsed;
  };
  if (args.has("--apply") && args.has("--dry-run")) {
    throw new Error("Choose either --apply or --dry-run");
  }
  return {
    apply: args.has("--apply"),
    limit: value("--limit", Number.MAX_SAFE_INTEGER),
    batchSize: Math.min(value("--batch-size", 25), 100),
  };
}

function getImageKitClient() {
  const privateKey = process.env.IMAGEKIT_PRIVATE_KEY;
  if (!privateKey) throw new Error("IMAGEKIT_PRIVATE_KEY is required");
  return new ImageKit({ privateKey });
}

function getSourceUrl(filePath: string) {
  const endpoint = process.env.NEXT_PUBLIC_IMAGEKIT_URL_ENDPOINT;
  if (!endpoint) throw new Error("NEXT_PUBLIC_IMAGEKIT_URL_ENDPOINT is required");
  if (
    !filePath.startsWith("/albums/") ||
    filePath.includes("\\") ||
    filePath.includes("?") ||
    filePath.includes("#") ||
    filePath.split("/").includes("..")
  ) {
    throw new Error("Stored ImageKit path is invalid");
  }
  const endpointUrl = new URL(endpoint);
  if (
    endpointUrl.protocol !== "https:" ||
    endpointUrl.username ||
    endpointUrl.password
  ) {
    throw new Error("ImageKit URL endpoint is invalid");
  }
  const endpointPath = endpointUrl.pathname.replace(/\/+$/, "");
  const url = new URL(`${endpointPath}${filePath}`, endpointUrl.origin);
  if (url.origin !== endpointUrl.origin) {
    throw new Error("Stored ImageKit path is invalid");
  }
  return url.toString();
}

function isInAlbumFolder(filePath: string | undefined, albumId: string) {
  return Boolean(
    filePath &&
      filePath.startsWith(`/albums/${albumId}/`) &&
      !filePath.split("/").includes(".."),
  );
}

async function findReplacement(
  client: ImageKit,
  folder: string,
  filePath: string,
) {
  const targetName = basename(filePath);
  for (let skip = 0; skip < 100_000; skip += 1000) {
    const files = await client.assets.list({
      type: "file",
      path: folder,
      limit: 1000,
      skip,
    });
    const match = files.find((file) => file.filePath === filePath);
    if (match) return match;
    if (files.length < 1000) return null;
  }
  throw new Error(`Could not locate deterministic replacement ${targetName}`);
}

async function verifyPrivateFile(
  client: ImageKit,
  fileId: string | undefined,
  expectedPath: string,
) {
  if (!fileId) return false;
  const details = await client.files.get(fileId);
  return (
    details.fileId === fileId &&
    details.filePath === expectedPath &&
    details.isPrivateFile === true
  );
}

function getRecordQueries(kind: SourceKind) {
  if (kind === MediaPrivacyMigrationSource.PHOTO) {
    return {
      findMany: (afterId: string | undefined, take: number) =>
        prisma.photo.findMany({
          where: {
            isPrivate: false,
            ...(afterId ? { id: { gt: afterId } } : {}),
          },
          orderBy: { id: "asc" },
          take,
          select: { id: true, albumId: true, imagekitFileId: true, filePath: true },
        }),
      markPrivate: (record: MediaRecord, fileId: string, filePath: string) =>
        prisma.photo.updateMany({
          where: {
            id: record.id,
            imagekitFileId: record.imagekitFileId,
            isPrivate: false,
          },
          data: { imagekitFileId: fileId, filePath, isPrivate: true },
        }),
    };
  }
  return {
    findMany: (afterId: string | undefined, take: number) =>
      prisma.albumAsset.findMany({
        where: {
          isPrivate: false,
          ...(afterId ? { id: { gt: afterId } } : {}),
        },
        orderBy: { id: "asc" },
        take,
        select: { id: true, albumId: true, imagekitFileId: true, filePath: true },
      }),
    markPrivate: (record: MediaRecord, fileId: string, filePath: string) =>
      prisma.albumAsset.updateMany({
        where: {
          id: record.id,
          imagekitFileId: record.imagekitFileId,
          isPrivate: false,
        },
        data: { imagekitFileId: fileId, filePath, isPrivate: true },
      }),
  };
}

async function migrateOne(
  client: ImageKit,
  record: MediaRecord,
  source: SourceKind,
  apply: boolean,
) {
  const folder = `/albums/${record.albumId}`;
  if (!isInAlbumFolder(record.filePath, record.albumId)) {
    throw new Error("Stored media does not match its album folder");
  }
  const sourceDetails = await client.files.get(record.imagekitFileId);
  if (
    sourceDetails.fileId !== record.imagekitFileId ||
    sourceDetails.filePath !== record.filePath ||
    !isInAlbumFolder(sourceDetails.filePath, record.albumId)
  ) {
    throw new Error("ImageKit source asset failed album ownership verification");
  }
  if (!apply) {
    return sourceDetails.isPrivateFile === true ? "verified" : "planned";
  }

  const job = await prisma.mediaPrivacyMigration.upsert({
    where: { sourceFileId: record.imagekitFileId },
    create: {
      sourceFileId: record.imagekitFileId,
      sourceRecordId: record.id,
      albumId: record.albumId,
      source,
    },
    update: {},
  });
  if (job.status === MediaPrivacyMigrationStatus.COMPLETED) return "skipped";
  if (
    job.status === MediaPrivacyMigrationStatus.PROCESSING &&
    job.updatedAt.getTime() > Date.now() - staleJobMilliseconds
  ) {
    return "skipped";
  }
  const claimed = await prisma.mediaPrivacyMigration.updateMany({
    where: {
      id: job.id,
      OR: [
        { status: MediaPrivacyMigrationStatus.PENDING },
        { status: MediaPrivacyMigrationStatus.FAILED },
        {
          status: MediaPrivacyMigrationStatus.PROCESSING,
          updatedAt: { lt: new Date(Date.now() - staleJobMilliseconds) },
        },
      ],
    },
    data: {
      status: MediaPrivacyMigrationStatus.PROCESSING,
      attempts: { increment: 1 },
      lastError: null,
    },
  });
  if (claimed.count !== 1) return "skipped";

  let replacementId = record.imagekitFileId;
  let replacementPath = record.filePath;
  if (sourceDetails.isPrivateFile !== true) {
    const extension = extname(record.filePath);
    const safeExtension = /^\.[A-Za-z0-9]{1,10}$/.test(extension)
      ? extension.toLowerCase()
      : ".bin";
    replacementPath = `${folder}/private-${record.id}${safeExtension}`;

    const existing = await findReplacement(client, `${folder}/`, replacementPath);
    if (existing && existing.isPrivateFile !== true) {
      throw new Error("Deterministic replacement path contains a public file");
    }
    if (existing) {
      replacementId = existing.fileId ?? "";
    } else {
      const upload = await client.files.upload({
        file: getSourceUrl(record.filePath),
        fileName: basename(replacementPath),
        folder,
        isPrivateFile: true,
        useUniqueFileName: false,
        overwriteFile: false,
        responseFields: ["isPrivateFile"],
      });
      replacementId = upload.fileId ?? "";
    }
  }

  if (
    !replacementId ||
    !(await verifyPrivateFile(client, replacementId, replacementPath))
  ) {
    throw new Error("ImageKit replacement could not be verified as private");
  }

  await prisma.mediaPrivacyMigration.update({
    where: { id: job.id },
    data: { targetFileId: replacementId },
  });
  const committed = await prisma.$transaction(async (tx) => {
    const updated =
      source === MediaPrivacyMigrationSource.PHOTO
        ? await tx.photo.updateMany({
            where: {
              id: record.id,
              imagekitFileId: record.imagekitFileId,
              isPrivate: false,
            },
            data: {
              imagekitFileId: replacementId,
              filePath: replacementPath,
              isPrivate: true,
            },
          })
        : await tx.albumAsset.updateMany({
            where: {
              id: record.id,
              imagekitFileId: record.imagekitFileId,
              isPrivate: false,
            },
            data: {
              imagekitFileId: replacementId,
              filePath: replacementPath,
              isPrivate: true,
            },
          });
    if (updated.count !== 1) {
      const [photo, asset] = await Promise.all([
        tx.photo.findUnique({
          where: { imagekitFileId: replacementId },
          select: { id: true },
        }),
        tx.albumAsset.findUnique({
          where: { imagekitFileId: replacementId },
          select: { id: true },
        }),
      ]);
      if (!photo && !asset) {
        await tx.mediaCleanupJob.upsert({
          where: { imagekitFileId: replacementId },
          create: {
            albumId: record.albumId,
            imagekitFileId: replacementId,
          },
          update: {},
        });
      }
      await tx.mediaPrivacyMigration.update({
        where: { id: job.id },
        data: {
          status: MediaPrivacyMigrationStatus.FAILED,
          targetFileId: replacementId,
          lastError: "Database media record changed during migration",
        },
      });
      return false;
    }
    if (replacementId !== record.imagekitFileId) {
      await tx.mediaCleanupJob.upsert({
        where: { imagekitFileId: record.imagekitFileId },
        create: {
          albumId: record.albumId,
          imagekitFileId: record.imagekitFileId,
        },
        update: {},
      });
    }
    await tx.mediaPrivacyMigration.update({
      where: { id: job.id },
      data: {
        status: MediaPrivacyMigrationStatus.COMPLETED,
        targetFileId: replacementId,
        lastError: null,
      },
    });
    return true;
  });
  if (!committed) {
    throw new Error("Database media record changed during migration");
  }
  return sourceDetails.isPrivateFile === true ? "verified" : "migrated";
}

async function run() {
  const options = cliOptions();
  const client = getImageKitClient();
  const report = { planned: 0, migrated: 0, verified: 0, skipped: 0, failed: 0 };
  let remaining = options.limit;

  for (const source of [
    MediaPrivacyMigrationSource.PHOTO,
    MediaPrivacyMigrationSource.ALBUM_ASSET,
  ]) {
    const queries = getRecordQueries(source);
    let afterId: string | undefined;
    while (remaining > 0) {
      const records = await queries.findMany(
        afterId,
        Math.min(options.batchSize, remaining),
      );
      if (records.length === 0) break;
      afterId = records.at(-1)?.id;

      for (const record of records) {
        try {
          const result = await migrateOne(client, record, source, options.apply);
          report[result] += 1;
          console.log(
            JSON.stringify({
              event: "media_privacy_migration",
              status: result,
              source,
              recordId: record.id,
              sourceFileId: record.imagekitFileId,
            }),
          );
        } catch (error) {
          report.failed += 1;
          const errorType =
            error instanceof Error ? error.name : "UnknownError";
          console.error(
            JSON.stringify({
              event: "media_privacy_migration",
              status: "failed",
              source,
              recordId: record.id,
              sourceFileId: record.imagekitFileId,
              errorType,
            }),
          );
          if (options.apply) {
            await prisma.mediaPrivacyMigration.updateMany({
              where: { sourceFileId: record.imagekitFileId },
              data: {
                status: MediaPrivacyMigrationStatus.FAILED,
                lastError: errorType,
              },
            });
          }
        }
        remaining -= 1;
      }
    }
  }
  console.log(
    JSON.stringify({
      event: "media_privacy_migration_report",
      mode: options.apply ? "apply" : "dry-run",
      ...report,
    }),
  );
  if (report.failed > 0) process.exitCode = 1;
}

run()
  .catch((error: unknown) => {
    console.error("Media privacy migration could not run", {
      errorType: error instanceof Error ? error.name : "UnknownError",
    });
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
