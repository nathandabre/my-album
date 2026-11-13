import { timingSafeEqual } from "node:crypto";
import { z } from "zod";

import { MediaCleanupStatus } from "@/generated/prisma/enums";
import { deleteImageKitFileFromAlbum } from "@/lib/imagekit-server";
import { prisma } from "@/lib/db";

const retrySchema = z.object({
  retryJobIds: z.array(z.string().min(1).max(128)).max(100).default([]),
});
const MAX_ATTEMPTS = 10;
const BATCH_SIZE = 20;
const staleLease = 10 * 60 * 1000;

function isAuthorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  const header = request.headers.get("authorization") ?? "";
  const supplied = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!secret || !supplied) return false;
  const expectedBuffer = Buffer.from(secret);
  const suppliedBuffer = Buffer.from(supplied);
  return (
    expectedBuffer.length === suppliedBuffer.length &&
    timingSafeEqual(expectedBuffer, suppliedBuffer)
  );
}

async function retryFailedJobs(jobIds: string[]) {
  if (jobIds.length === 0) return 0;
  const result = await prisma.mediaCleanupJob.updateMany({
    where: { id: { in: jobIds }, status: MediaCleanupStatus.FAILED },
    data: {
      status: MediaCleanupStatus.PENDING,
      attempts: 0,
      nextAttemptAt: new Date(),
      processingAt: null,
      lastError: null,
    },
  });
  return result.count;
}

async function processCleanupJobs() {
  const now = new Date();
  await prisma.mediaCleanupJob.updateMany({
    where: {
      status: MediaCleanupStatus.PROCESSING,
      processingAt: { lt: new Date(now.getTime() - staleLease) },
    },
    data: {
      status: MediaCleanupStatus.PENDING,
      processingAt: null,
      nextAttemptAt: now,
    },
  });

  const jobs = await prisma.mediaCleanupJob.findMany({
    where: {
      status: MediaCleanupStatus.PENDING,
      nextAttemptAt: { lte: now },
    },
    orderBy: { createdAt: "asc" },
    take: BATCH_SIZE,
    select: { id: true, albumId: true, imagekitFileId: true, attempts: true },
  });

  let completed = 0;
  let claimedCount = 0;
  for (const job of jobs) {
    const claimed = await prisma.mediaCleanupJob.updateMany({
      where: { id: job.id, status: MediaCleanupStatus.PENDING },
      data: { status: MediaCleanupStatus.PROCESSING, processingAt: new Date() },
    });
    if (claimed.count !== 1) continue;
    claimedCount += 1;

    try {
      const [photo, asset] = await Promise.all([
        prisma.photo.findUnique({
          where: { imagekitFileId: job.imagekitFileId },
          select: { id: true },
        }),
        prisma.albumAsset.findUnique({
          where: { imagekitFileId: job.imagekitFileId },
          select: { id: true },
        }),
      ]);
      if (photo || asset) {
        await prisma.mediaCleanupJob.update({
          where: { id: job.id },
          data: {
            status: MediaCleanupStatus.FAILED,
            processingAt: null,
            lastError: "File is still referenced by an album record",
          },
        });
        console.error("Media cleanup blocked for a referenced file", {
          jobId: job.id,
        });
        continue;
      }

      await deleteImageKitFileFromAlbum(job.albumId, job.imagekitFileId);
      await prisma.mediaCleanupJob.update({
        where: { id: job.id },
        data: {
          status: MediaCleanupStatus.COMPLETED,
          processingAt: null,
          lastError: null,
        },
      });
      completed += 1;
    } catch (error) {
      const attempts = job.attempts + 1;
      const failedPermanently = attempts >= MAX_ATTEMPTS;
      const backoffMilliseconds = Math.min(
        60_000 * 2 ** (attempts - 1),
        24 * 60 * 60 * 1000,
      );
      await prisma.mediaCleanupJob.update({
        where: { id: job.id },
        data: {
          attempts,
          status: failedPermanently
            ? MediaCleanupStatus.FAILED
            : MediaCleanupStatus.PENDING,
          processingAt: null,
          nextAttemptAt: new Date(Date.now() + backoffMilliseconds),
          lastError: error instanceof Error ? error.name : "UnknownError",
        },
      });
      console.error("Media cleanup attempt failed", {
        jobId: job.id,
        attempt: attempts,
        permanent: failedPermanently,
        errorType: error instanceof Error ? error.name : "UnknownError",
      });
    }
  }
  return { claimed: claimedCount, completed };
}

export async function GET(request: Request) {
  if (!process.env.CRON_SECRET) {
    return Response.json({ error: "Cleanup worker is not configured" }, { status: 503 });
  }
  if (!isAuthorized(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const result = await processCleanupJobs();
    return Response.json(result, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("Media cleanup worker failed", {
      errorType: error instanceof Error ? error.name : "UnknownError",
    });
    return Response.json(
      { error: "Cleanup worker is temporarily unavailable" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}

export async function POST(request: Request) {
  if (!process.env.CRON_SECRET) {
    return Response.json({ error: "Cleanup worker is not configured" }, { status: 503 });
  }
  if (!isAuthorized(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const parsed = retrySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "Invalid retry request" }, { status: 400 });
  }
  try {
    const retried = await retryFailedJobs(parsed.data.retryJobIds);
    return Response.json({ retried }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("Failed to reset media cleanup jobs", {
      errorType: error instanceof Error ? error.name : "UnknownError",
    });
    return Response.json(
      { error: "Cleanup retry is temporarily unavailable" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
