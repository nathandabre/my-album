import { upload, type UploadResponse } from "@imagekit/next";

export type ImageKitAuthParams = {
  token: string;
  expire: number;
  signature: string;
  publicKey: string;
};

export async function getImageKitUploadAuth(
  albumId: string,
): Promise<ImageKitAuthParams & { folder: string }> {
  const response = await fetch("/api/upload-auth", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ albumId }),
  });

  if (!response.ok) {
    throw new Error(`ImageKit authorization failed (${response.status})`);
  }

  const responseBody: unknown = await response.json();
  if (
    !responseBody ||
    typeof responseBody !== "object" ||
    !("token" in responseBody) ||
    !("expire" in responseBody) ||
    !("signature" in responseBody) ||
    !("publicKey" in responseBody) ||
    !("folder" in responseBody) ||
    typeof responseBody.token !== "string" ||
    typeof responseBody.expire !== "number" ||
    typeof responseBody.signature !== "string" ||
    typeof responseBody.publicKey !== "string" ||
    typeof responseBody.folder !== "string"
  ) {
    throw new Error("ImageKit authorization response is invalid");
  }
  return {
    token: responseBody.token,
    expire: responseBody.expire,
    signature: responseBody.signature,
    publicKey: responseBody.publicKey,
    folder: responseBody.folder,
  };
}

export async function uploadMediaToImageKit(
  file: File,
  albumId: string,
  options?: {
    tags?: string[];
    onProgress?: (progress: number) => void;
  },
): Promise<UploadResponse> {
  const { token, expire, signature, publicKey, folder } =
    await getImageKitUploadAuth(albumId);

  return upload({
    file,
    fileName: file.name,
    publicKey,
    token,
    expire,
    signature,
    folder,
    isPrivateFile: true,
    responseFields: ["isPrivateFile"],
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
  albumId: string,
  options?: {
    tags?: string[];
    onProgress?: (progress: number) => void;
  },
): Promise<UploadResponse> {
  return uploadMediaToImageKit(file, albumId, options);
}

export function getImageKitUrl(filePath: string, transformations?: string): string {
  if (!filePath) return "";
  if (
    !filePath.startsWith("/albums/") ||
    filePath.includes("\\") ||
    filePath.includes("?") ||
    filePath.includes("#") ||
    filePath.split("/").includes("..")
  ) {
    return "";
  }

  const endpoint = process.env.NEXT_PUBLIC_IMAGEKIT_URL_ENDPOINT;
  if (!endpoint) return "";
  try {
    const endpointUrl = new URL(endpoint);
    if (endpointUrl.protocol !== "https:" || endpointUrl.username || endpointUrl.password) {
      return "";
    }
    const endpointPath = endpointUrl.pathname.replace(/\/+$/, "");
    const transformPath =
      transformations && /^[a-z0-9,-]+$/i.test(transformations)
        ? `/tr:${transformations}`
        : "";
    const fileUrl = new URL(
      `${endpointPath}${transformPath}${filePath}`,
      endpointUrl.origin,
    );
    return fileUrl.origin === endpointUrl.origin ? fileUrl.toString() : "";
  } catch {
    return "";
  }
}
