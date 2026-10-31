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

export async function uploadImageToImageKit(
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
