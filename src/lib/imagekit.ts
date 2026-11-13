import { z } from "zod";

const uploadResponseSchema = z.object({
  fileId: z.string().min(1),
  filePath: z.string().min(1),
  name: z.string().min(1),
  mimeType: z.string().min(1),
  width: z.number().int().nonnegative(),
  height: z.number().int().nonnegative(),
  sizeBytes: z.number().int().positive(),
  isPrivateFile: z.literal(true),
});

export type UploadResponse = z.infer<typeof uploadResponseSchema> & {
  url?: string;
};

export async function uploadMediaToImageKit(
  file: File,
  albumId: string,
  options?: { onProgress?: (progress: number) => void },
): Promise<UploadResponse> {
  const formData = new FormData();
  formData.append("file", file);

  const response = await new Promise<XMLHttpRequest>((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open(
      "POST",
      `/api/albums/${encodeURIComponent(albumId)}/upload`,
    );
    request.responseType = "json";
    request.setRequestHeader("Accept", "application/json");
    request.upload.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) {
        options?.onProgress?.(Math.round((event.loaded / event.total) * 100));
      }
    };
    request.onerror = () => reject(new Error("Media upload request failed."));
    request.onabort = () => reject(new Error("Media upload was cancelled."));
    request.onload = () => resolve(request);
    request.send(formData);
  });

  const body: unknown = response.response;
  if (response.status < 200 || response.status >= 300) {
    const error =
      body && typeof body === "object" && "error" in body &&
      typeof body.error === "string"
        ? body.error
        : "Media upload failed.";
    throw new Error(error);
  }
  const parsed = uploadResponseSchema.safeParse(body);
  if (!parsed.success) throw new Error("Media upload response is invalid.");
  options?.onProgress?.(100);
  return parsed.data;
}

export async function uploadImageToImageKit(
  file: File,
  albumId: string,
  options?: { onProgress?: (progress: number) => void },
) {
  return uploadMediaToImageKit(file, albumId, options);
}

export function getImageKitUrl(
  filePath: string,
  transformations?: string,
): string {
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
    if (
      endpointUrl.protocol !== "https:" ||
      endpointUrl.username ||
      endpointUrl.password
    ) {
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
