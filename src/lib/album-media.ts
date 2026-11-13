import "server-only";

import { basename } from "node:path";

import { prisma } from "@/lib/db";
import { getAlbumAuthorization } from "@/lib/album-access";
import { getImageKitDeliveryUrl } from "@/lib/imagekit-server";

function safeDownloadName(name: string) {
  const fileName = basename(name).replace(/[\r\n"\\]/g, "_").trim();
  return fileName || "download";
}

function publicImageKitFileUrl(
  endpoint: string,
  filePath: string,
  transformations?: string,
) {
  const endpointUrl = new URL(endpoint);
  if (endpointUrl.protocol !== "https:" || endpointUrl.username || endpointUrl.password) {
    throw new Error("ImageKit URL endpoint is invalid");
  }
  const endpointPath = endpointUrl.pathname.replace(/\/+$/, "");
  const transformationPath = transformations ? `/tr:${transformations}` : "";
  const fileUrl = new URL(
    `${endpointPath}${transformationPath}${filePath}`,
    endpointUrl.origin,
  );
  if (fileUrl.origin !== endpointUrl.origin) {
    throw new Error("ImageKit returned an invalid file path");
  }
  return fileUrl;
}

function validTransformations(value: string | null) {
  if (!value || value.length > 100) return undefined;
  const parts = value.split(",");
  const seen = new Set<string>();
  for (const part of parts) {
    const key = part.split("-")[0];
    if (!key || seen.has(key)) return undefined;
    seen.add(key);
    if (key === "fo" && part === "fo-auto") continue;
    const match = /^(w|h|q)-(\d{1,4})$/.exec(part);
    if (!match) return undefined;
    const valueNumber = Number(match[2]);
    if (
      (match[1] === "w" || match[1] === "h") &&
      (valueNumber < 1 || valueNumber > 3000)
    ) {
      return undefined;
    }
    if (match[1] === "q" && (valueNumber < 1 || valueNumber > 100)) {
      return undefined;
    }
  }
  return parts.join(",");
}

export async function serveAlbumMedia(
  request: Request,
  shareSlug: string,
  assetId: string,
  asDownload: boolean,
) {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(assetId)) {
    return new Response("File not found", { status: 404 });
  }

  const album = await prisma.album.findUnique({
    where: { shareSlug },
    select: {
      id: true,
      visibility: true,
      allowDownload: true,
      expiresAt: true,
      updatedAt: true,
      owner: { select: { clerkId: true } },
    },
  });
  if (!album) return new Response("Not found", { status: 404 });

  const { decision, isOwner } = await getAlbumAuthorization(album);
  if (decision === "private" || decision === "expired") {
    return new Response("Not found", { status: 404 });
  }
  if (decision === "password-required") {
    return new Response("Password required", { status: 403 });
  }
  if (asDownload && !album.allowDownload && !isOwner) {
    return new Response("Downloads are disabled for this album", { status: 403 });
  }

  const photo = await prisma.photo.findFirst({
    where: { id: assetId, albumId: album.id },
    select: { filePath: true, mimeType: true, caption: true, isPrivate: true },
  });
  const asset = photo
    ? null
    : await prisma.albumAsset.findFirst({
        where: { id: assetId, albumId: album.id },
        select: {
          filePath: true,
          mimeType: true,
          fileName: true,
          isPrivate: true,
        },
      });
  const file = photo ?? asset;
  if (
    !file ||
    !file.filePath.startsWith(`/albums/${album.id}/`) ||
    file.filePath.split("/").includes("..")
  ) {
    return new Response("File not found", { status: 404 });
  }

  const endpoint = process.env.NEXT_PUBLIC_IMAGEKIT_URL_ENDPOINT;
  if (!endpoint) return new Response("Storage is unavailable", { status: 503 });

  let fileUrl: URL;
  try {
    const transforms = asDownload
      ? undefined
      : validTransformations(new URL(request.url).searchParams.get("tr"));
    fileUrl = file.isPrivate
      ? getImageKitDeliveryUrl(file.filePath, transforms)
      : publicImageKitFileUrl(endpoint, file.filePath, transforms);
  } catch {
    return new Response("Storage is unavailable", { status: 503 });
  }

  const range = request.headers.get("range");
  if (range && !/^bytes=\d*-\d*$/.test(range)) {
    return new Response("Invalid range", {
      status: 416,
      headers: { "Content-Range": "bytes */*" },
    });
  }

  let upstream: Response;
  try {
    upstream = await fetch(fileUrl, {
      cache: "no-store",
      headers: range ? { range } : undefined,
    });
  } catch {
    return new Response("Unable to retrieve this file", { status: 502 });
  }
  if (!upstream.ok && upstream.status !== 206 && upstream.status !== 416) {
    return new Response("Unable to retrieve this file", { status: 502 });
  }

  const rawName =
    (asset && "fileName" in asset && asset.fileName) ||
    (photo?.caption
      ? `${photo.caption}${fileUrl.pathname.match(/\.[a-zA-Z0-9]+$/)?.[0] ?? ""}`
      : basename(file.filePath));
  const headers = new Headers({
    "Content-Type": file.mimeType || "application/octet-stream",
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
  });
  if (asDownload) {
    const fileName = safeDownloadName(rawName);
    const asciiName = fileName.replace(/[^\x20-\x7E]/g, "_");
    headers.set(
      "Content-Disposition",
      `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
    );
  } else {
    headers.set("Content-Disposition", "inline");
    headers.set("Content-Security-Policy", "default-src 'none'; sandbox");
  }
  for (const headerName of ["accept-ranges", "content-length", "content-range"]) {
    const value = upstream.headers.get(headerName);
    if (value) headers.set(headerName, value);
  }
  return new Response(upstream.body, { status: upstream.status, headers });
}
