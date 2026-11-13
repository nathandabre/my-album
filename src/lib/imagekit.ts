import { upload, type UploadResponse } from "@imagekit/next";

export type ImageKitAuthParams = {
  token: string;
  expire: number;
  signature: string;
  publicKey: string;
};

export async function getImageKitUploadAuth(): Promise<ImageKitAuthParams> {
  const response = await fetch("/api/upload-auth");

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `ImageKit auth failed (${response.status}): ${errorText || "Unknown error"}`,
    );
  }

  return response.json();
}

export async function uploadMediaToImageKit(
  file: File,
  options?: {
    folder?: string;
    tags?: string[];
    onProgress?: (progress: number) => void;
  },
): Promise<UploadResponse> {
  const { token, expire, signature, publicKey } = await getImageKitUploadAuth();

  return upload({
    file,
    fileName: file.name,
    publicKey,
    token,
    expire,
    signature,
    folder: options?.folder ?? "/albums",
    tags: options?.tags,
    useUniqueFileName: true,
    onProgress: options?.onProgress
      ? (event) => {
          if (event.total > 0) {
            options.onProgress?.(Math.round((event.loaded / event.total) * 100));
          }
        }
      : undefined,
  });
}

export async function uploadImageToImageKit(
  file: File,
  options?: {
    folder?: string;
    tags?: string[];
    onProgress?: (progress: number) => void;
  },
): Promise<UploadResponse> {
  return uploadMediaToImageKit(file, options);
}

export function getImageKitUrl(filePath: string, transformations?: string): string {
  if (!filePath) return "";
  if (filePath.startsWith("http://") || filePath.startsWith("https://")) {
    return filePath;
  }
  const endpoint = (process.env.NEXT_PUBLIC_IMAGEKIT_URL_ENDPOINT ?? "").replace(/\/$/, "");
  const normalizedPath = filePath.startsWith("/") ? filePath : `/${filePath}`;
  if (transformations) {
    return `${endpoint}/tr:${transformations}${normalizedPath}`;
  }
  return `${endpoint}${normalizedPath}`;
}
