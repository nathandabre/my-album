import { randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import Busboy from "busboy";
import { z } from "zod";

import { getCurrentDbUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { enqueueUnlinkedMediaCleanup } from "@/lib/media-cleanup";
import {
  detectUploadType,
  getTrustedUploadFields,
  getUploadExtension,
  MAX_VIDEO_BYTES,
  supportedMediaTypeSchema,
  validateUploadSize,
} from "@/lib/media-upload-policy";
import {
  adjustMediaUploadReservation,
  releaseMediaUploadReservation,
  reserveMediaUpload,
} from "@/lib/media-upload-quota";
import { verifyImageKitUpload } from "@/lib/imagekit-server";

export const maxDuration = 900;

const imageKitResponseSchema = z.object({
  fileId: z.string().regex(/^[A-Za-z0-9_-]{1,255}$/),
});
const multipartOverhead = 16_384;

class InvalidUploadRequest extends Error {}

function isSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  return Boolean(origin && origin === new URL(request.url).origin);
}

function createMultipartPart(boundary: string, name: string, value: string) {
  return `--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`;
}

async function uploadStreamToImageKit(
  fileStream: NodeJS.ReadableStream & AsyncIterable<Buffer>,
  originalMimeType: string,
  albumId: string,
) {
  const privateKey = process.env.IMAGEKIT_PRIVATE_KEY;
  if (!privateKey) throw new Error("ImageKit is not configured");

  const iterator = fileStream[Symbol.asyncIterator]();
  const prefixParts: Buffer[] = [];
  let prefixSize = 0;
  while (prefixSize < 64) {
    const next = await iterator.next();
    if (next.done) break;
    const chunk = Buffer.from(next.value);
    prefixParts.push(chunk);
    prefixSize += chunk.length;
  }
  const initialBytes = Buffer.concat(prefixParts);
  const prefix = initialBytes.subarray(0, 64);
  const mimeTypeResult = supportedMediaTypeSchema.safeParse(
    detectUploadType(prefix),
  );
  if (!mimeTypeResult.success) {
    throw new InvalidUploadRequest("Unsupported or invalid file content");
  }
  const mimeType = mimeTypeResult.data;
  if (mimeType !== originalMimeType || !validateUploadSize(mimeType, prefixSize)) {
    throw new InvalidUploadRequest("Unsupported or invalid file content");
  }

  const fileName = `${randomUUID()}${getUploadExtension(mimeType)}`;
  const boundary = `my-album-${randomUUID()}`;
  const uploadFields = getTrustedUploadFields(albumId, fileName);
  let uploadedBytes = prefixSize;
  const maxBytes = mimeType.startsWith("video/")
    ? MAX_VIDEO_BYTES
    : 200_000_000;

  async function* multipartBody() {
    for (const [name, value] of Object.entries(uploadFields)) {
      yield createMultipartPart(boundary, name, value);
    }
    yield `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${fileName}"\r\nContent-Type: ${mimeType}\r\n\r\n`;

    if (initialBytes.length > 0) yield initialBytes;
    while (true) {
      const next = await iterator.next();
      if (next.done) break;
      const chunk = Buffer.from(next.value);
      uploadedBytes += chunk.length;
      if (uploadedBytes > maxBytes) {
        throw new InvalidUploadRequest("Uploaded file exceeds the supported size");
      }
      yield chunk;
    }
    if (!validateUploadSize(mimeType, uploadedBytes)) {
      throw new InvalidUploadRequest("Uploaded file exceeds the supported size");
    }
    yield `\r\n--${boundary}--\r\n`;
  }

  const multipartBodyIterator = multipartBody();
  const requestInit = {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${privateKey}:`).toString("base64")}`,
      "Content-Type": `multipart/form-data; boundary=${boundary}`,
    },
    body: new ReadableStream<Uint8Array>({
      async pull(controller) {
        const next = await multipartBodyIterator.next();
        if (next.done) {
          controller.close();
        } else {
          controller.enqueue(
            typeof next.value === "string"
              ? new TextEncoder().encode(next.value)
              : next.value,
          );
        }
      },
      async cancel() {
        await multipartBodyIterator.return();
      },
    }),
    duplex: "half",
    cache: "no-store",
  } satisfies RequestInit & { duplex: "half" };
  const response = await fetch(
    "https://upload.imagekit.io/api/v1/files/upload",
    requestInit,
  );

  if (!response.ok) {
    throw new Error(`ImageKit upload failed (${response.status})`);
  }
  const parsed = imageKitResponseSchema.safeParse(await response.json());
  if (!parsed.success) throw new Error("ImageKit returned an invalid upload response");

  return { fileId: parsed.data.fileId, mimeType, uploadedBytes };
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ album: string }> },
) {
  if (!isSameOrigin(request)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }
  const { album: albumId } = await params;
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(albumId)) {
    return Response.json({ error: "Invalid album" }, { status: 400 });
  }
  const user = await getCurrentDbUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const album = await prisma.album.findFirst({
    where: { id: albumId, ownerId: user.id },
    select: { id: true },
  });
  if (!album) return Response.json({ error: "Album not found" }, { status: 404 });

  const contentType = request.headers.get("content-type") ?? "";
  const contentLength = Number(request.headers.get("content-length"));
  if (
    !contentType.toLowerCase().startsWith("multipart/form-data;") ||
    !Number.isSafeInteger(contentLength) ||
    contentLength <= 0 ||
    contentLength > MAX_VIDEO_BYTES + multipartOverhead
  ) {
    return Response.json({ error: "Invalid upload request" }, { status: 400 });
  }
  if (!request.body) {
    return Response.json({ error: "Upload body is missing" }, { status: 400 });
  }

  const reserved = await reserveMediaUpload(user.id, contentLength);
  if (!reserved) {
    return Response.json({ error: "Daily upload quota exceeded" }, { status: 429 });
  }

  let uploadedFileId: string | null = null;
  try {
    const parser = Busboy({
      headers: { "content-type": contentType },
      limits: { files: 1, fields: 0, fileSize: MAX_VIDEO_BYTES + 1 },
    });
    const source = Readable.fromWeb(
      request.body as import("node:stream/web").ReadableStream<Uint8Array>,
    );
    let fileCount = 0;
    const uploadState: {
      result: Promise<Awaited<ReturnType<typeof uploadStreamToImageKit>>> | null;
    } = { result: null };
    let invalidParts = false;
    parser.on("field", () => {
      invalidParts = true;
    });
    parser.on("fieldsLimit", () => {
      invalidParts = true;
    });
    parser.on("filesLimit", () => {
      invalidParts = true;
    });
    parser.on("partsLimit", () => {
      invalidParts = true;
    });
    parser.on("file", (fieldName, stream, info) => {
      fileCount += 1;
      if (fieldName !== "file" || fileCount !== 1 || invalidParts) {
        invalidParts = true;
        stream.resume();
        return;
      }
      stream.on("limit", () => {
        invalidParts = true;
        source.destroy(new Error("Upload exceeds maximum file size"));
      });
      if (!info.mimeType) {
        invalidParts = true;
        stream.resume();
        return;
      }
      uploadState.result = uploadStreamToImageKit(
        stream,
        info.mimeType,
        albumId,
      );
      void uploadState.result.catch((error: unknown) =>
        source.destroy(
          error instanceof Error ? error : new Error("ImageKit upload failed"),
        ),
      );
    });

    source.pipe(parser);
    await new Promise<void>((resolve, reject) => {
      parser.once("close", resolve);
      parser.once("error", reject);
      source.once("error", reject);
    });
    const uploadResult = uploadState.result;
    if (!uploadResult) {
      throw new InvalidUploadRequest("Upload request must contain exactly one file");
    }
    const uploaded = await uploadResult;
    uploadedFileId = uploaded.fileId;
    if (invalidParts || fileCount !== 1) {
      throw new InvalidUploadRequest("Upload request must contain exactly one file");
    }
    const verified = await verifyImageKitUpload(
      albumId,
      uploaded.fileId,
      uploaded.mimeType,
    );
    await adjustMediaUploadReservation(
      user.id,
      contentLength,
      uploaded.uploadedBytes,
    );
    return Response.json(
      {
        fileId: verified.fileId,
        filePath: verified.filePath,
        name: verified.fileName,
        mimeType: verified.mimeType,
        width: verified.width,
        height: verified.height,
        sizeBytes: verified.sizeBytes,
        isPrivateFile: verified.isPrivate,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (uploadedFileId) {
      try {
        await enqueueUnlinkedMediaCleanup(albumId, [uploadedFileId]);
      } catch (cleanupError) {
        console.error("Could not queue rejected upload for cleanup", {
          albumId,
          errorType:
            cleanupError instanceof Error ? cleanupError.name : "UnknownError",
        });
      }
    }
    await releaseMediaUploadReservation(user.id, contentLength);
    console.error("Media upload failed", {
      albumId,
      errorType: error instanceof Error ? error.name : "UnknownError",
    });
    return Response.json(
      { error: "Unable to upload media. Please try again." },
      { status: error instanceof InvalidUploadRequest ? 400 : 502 },
    );
  }
}
