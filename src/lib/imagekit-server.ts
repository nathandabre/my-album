import "server-only";

import { z } from "zod";
import { detectMediaType } from "@/lib/media-validation";
import { buildSignedImageKitUrl } from "@/lib/imagekit-signing";

const imageKitFileSchema = z.object({
  fileId: z.string().min(1).max(255),
  filePath: z.string().min(1).max(1024),
  name: z.string().min(1).max(255),
  size: z.number().int().positive(),
  isPrivateFile: z.boolean(),
  width: z.number().int().nonnegative().optional(),
  height: z.number().int().nonnegative().optional(),
  duration: z.number().nonnegative().optional(),
});

const MAX_IMAGE_BYTES = 200_000_000;
const MAX_VIDEO_BYTES = 2_000_000_000;
const MAX_IMAGE_DIMENSION = 20_000;
const MAX_IMAGE_PIXELS = 120_000_000;
const MAX_VIDEO_DURATION_SECONDS = 60 * 60;

export type VerifiedImageKitUpload = {
  fileId: string;
  filePath: string;
  fileName: string;
  mimeType: string;
  width: number;
  height: number;
  sizeBytes: number;
  isPrivate: true;
};

function getPrivateKey() {
  const privateKey = process.env.IMAGEKIT_PRIVATE_KEY;
  if (!privateKey) throw new Error("IMAGEKIT_PRIVATE_KEY is not configured");
  return privateKey;
}

function getImageKitEndpoint() {
  const endpoint = process.env.NEXT_PUBLIC_IMAGEKIT_URL_ENDPOINT;
  if (!endpoint) throw new Error("ImageKit URL endpoint is not configured");
  const url = new URL(endpoint);
  if (url.protocol !== "https:" || url.username || url.password) {
    throw new Error("ImageKit URL endpoint is invalid");
  }
  return url;
}

async function getImageKitFileDetails(fileId: string) {
  const privateKey = getPrivateKey();
  const response = await fetch(
    `https://api.imagekit.io/v1/files/${encodeURIComponent(fileId)}/details`,
    {
      headers: {
        Authorization: `Basic ${Buffer.from(`${privateKey}:`).toString("base64")}`,
      },
      cache: "no-store",
    },
  );
  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(`ImageKit file details request failed (${response.status})`);
  }

  const parsed = imageKitFileSchema.safeParse(await response.json());
  if (!parsed.success) throw new Error("ImageKit returned invalid file details");
  return parsed.data;
}

async function readFilePrefix(filePath: string) {
  const response = await fetch(getImageKitDeliveryUrl(filePath), {
    headers: { range: "bytes=0-63" },
    cache: "no-store",
  });
  if (!response.ok && response.status !== 206) {
    throw new Error(`ImageKit file content request failed (${response.status})`);
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error("ImageKit did not return file content");
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (length < 64) {
      const { done, value } = await reader.read();
      if (done || !value) break;
      const chunk = value.subarray(0, 64 - length);
      chunks.push(chunk);
      length += chunk.length;
      if (chunk.length < value.length) break;
    }
  } finally {
    await reader.cancel();
  }
  return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)));
}

export async function verifyImageKitUpload(
  albumId: string,
  fileId: string,
  declaredMimeType: string,
): Promise<VerifiedImageKitUpload> {
  if (!/^[A-Za-z0-9_-]{1,255}$/.test(fileId)) {
    throw new Error("ImageKit returned an invalid file ID");
  }

  const details = await getImageKitFileDetails(fileId);
  if (!details) throw new Error("ImageKit file was not found");
  const expectedFolder = `/albums/${albumId}/`;
  if (
    details.fileId !== fileId ||
    details.isPrivateFile !== true ||
    !details.filePath.startsWith(expectedFolder) ||
    details.filePath.split("/").includes("..")
  ) {
    throw new Error("Uploaded file does not belong to this album");
  }

  const mimeType = detectMediaType(await readFilePrefix(details.filePath));
  if (!mimeType || mimeType !== declaredMimeType) {
    throw new Error("Uploaded file content is not a supported media type");
  }

  const isVideo = mimeType.startsWith("video/");
  const width = details.width ?? 0;
  const height = details.height ?? 0;
  if (
    details.size > (isVideo ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES) ||
    (isVideo &&
      (details.duration === undefined ||
        details.duration > MAX_VIDEO_DURATION_SECONDS)) ||
    (!isVideo &&
      (width < 1 ||
        height < 1 ||
        width > MAX_IMAGE_DIMENSION ||
        height > MAX_IMAGE_DIMENSION ||
        width * height > MAX_IMAGE_PIXELS))
  ) {
    throw new Error("Uploaded media exceeds the supported size or dimensions");
  }

  return {
    fileId: details.fileId,
    filePath: details.filePath,
    fileName: details.name,
    mimeType,
    width,
    height,
    sizeBytes: details.size,
    isPrivate: true,
  };
}

export function getImageKitDeliveryUrl(
  filePath: string,
  transformations?: string,
) {
  const endpointUrl = getImageKitEndpoint();
  return buildSignedImageKitUrl({
    privateKey: getPrivateKey(),
    endpoint: endpointUrl.toString(),
    filePath,
    transformations,
    expiresIn: 60,
  });
}

export async function deleteImageKitFile(fileId: string) {
  const response = await fetch(
    `https://api.imagekit.io/v1/files/${encodeURIComponent(fileId)}`,
    {
      method: "DELETE",
      headers: {
        Authorization: `Basic ${Buffer.from(`${getPrivateKey()}:`).toString("base64")}`,
      },
      cache: "no-store",
    },
  );
  if (!response.ok && response.status !== 404) {
    throw new Error(`ImageKit file deletion failed (${response.status})`);
  }
}

export async function deleteImageKitFileFromAlbum(
  albumId: string,
  fileId: string,
) {
  if (!/^[A-Za-z0-9_-]{1,255}$/.test(fileId)) {
    throw new Error("ImageKit file ID is invalid");
  }
  const details = await getImageKitFileDetails(fileId);
  if (!details) return;
  if (
    !details.filePath.startsWith(`/albums/${albumId}/`) ||
    details.filePath.split("/").includes("..")
  ) {
    throw new Error("ImageKit file does not belong to this album");
  }
  await deleteImageKitFile(fileId);
}
