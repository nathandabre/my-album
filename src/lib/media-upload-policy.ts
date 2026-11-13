import { z } from "zod";

import { detectMediaType } from "@/lib/media-validation";

export const MAX_IMAGE_BYTES = 200_000_000;
export const MAX_VIDEO_BYTES = 2_000_000_000;
export const DAILY_UPLOAD_FILE_LIMIT = 100;
export const DAILY_UPLOAD_BYTE_LIMIT = BigInt(10_000_000_000);

const extensions: Record<string, string> = {
  "image/avif": ".avif",
  "image/gif": ".gif",
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "video/mp4": ".mp4",
  "video/quicktime": ".mov",
  "video/webm": ".webm",
};

export const supportedMediaTypeSchema = z.enum([
  "image/avif",
  "image/gif",
  "image/jpeg",
  "image/png",
  "image/webp",
  "video/mp4",
  "video/quicktime",
  "video/webm",
]);

export function detectUploadType(prefix: Uint8Array) {
  return detectMediaType(prefix);
}

export function getUploadExtension(mimeType: string) {
  return extensions[mimeType];
}

export function getTrustedUploadFields(albumId: string, fileName: string) {
  return {
    fileName,
    folder: `/albums/${albumId}`,
    isPrivateFile: "true",
    useUniqueFileName: "true",
    responseFields: "isPrivateFile",
  } as const;
}

export function validateUploadSize(mimeType: string, size: number) {
  if (!supportedMediaTypeSchema.safeParse(mimeType).success || size <= 0) {
    return false;
  }
  const maximum = mimeType.startsWith("video/")
    ? MAX_VIDEO_BYTES
    : MAX_IMAGE_BYTES;
  return size <= maximum;
}
