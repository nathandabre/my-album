import { basename } from "node:path";
import { auth } from "@clerk/nextjs/server";
import { cookies } from "next/headers";

import { AlbumVisibility } from "@/generated/prisma/enums";
import { prisma } from "@/lib/db";

type DownloadRouteProps = {
  params: Promise<{ shareSlug: string; assetId: string }>;
};

function safeDownloadName(name: string) {
  const fileName = basename(name).replace(/[\r\n"\\]/g, "_").trim();
  return fileName || "download";
}

export async function GET(request: Request, { params }: DownloadRouteProps) {
  const { shareSlug, assetId } = await params;
  const album = await prisma.album.findUnique({
    where: { shareSlug },
    select: {
      id: true,
      visibility: true,
      allowDownload: true,
      expiresAt: true,
      owner: { select: { clerkId: true } },
    },
  });

  if (!album) return new Response("Not found", { status: 404 });

  const identityRequired =
    album.visibility === AlbumVisibility.PRIVATE ||
    album.visibility === AlbumVisibility.PASSWORD ||
    Boolean(album.expiresAt) ||
    !album.allowDownload;
  const userId = identityRequired ? (await auth()).userId : null;
  const isOwner = Boolean(userId && userId === album.owner.clerkId);
  if (album.expiresAt && album.expiresAt < new Date() && !isOwner) {
    return new Response("This album has expired", { status: 410 });
  }
  if (album.visibility === AlbumVisibility.PRIVATE && !isOwner) {
    return new Response("Not found", { status: 404 });
  }
  if (album.visibility === AlbumVisibility.PASSWORD && !isOwner) {
    const cookieStore = await cookies();
    if (cookieStore.get(`unlocked_${shareSlug}`)?.value !== "true") {
      return new Response("Password required", { status: 403 });
    }
  }
  if (!album.allowDownload && !isOwner) {
    return new Response("Downloads are disabled for this album", { status: 403 });
  }

  const photo = await prisma.photo.findFirst({
    where: { id: assetId, albumId: album.id },
    select: { filePath: true, mimeType: true, caption: true },
  });
  const asset = photo
    ? null
    : await prisma.albumAsset.findFirst({
        where: { id: assetId, albumId: album.id },
        select: { filePath: true, mimeType: true, fileName: true },
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
    const endpointUrl = new URL(endpoint);
    const endpointPath = endpointUrl.pathname.replace(/\/+$/, "");
    fileUrl = new URL(`${endpointPath}${file.filePath}`, endpointUrl.origin);
    if (fileUrl.origin !== endpointUrl.origin) {
      return new Response("File not found", { status: 404 });
    }
  } catch {
    return new Response("Storage is unavailable", { status: 503 });
  }

  let upstream: Response;
  try {
    const range = request.headers.get("range");
    upstream = await fetch(fileUrl, {
      cache: "no-store",
      headers: range ? { range } : undefined,
    });
  } catch {
    return new Response("Unable to retrieve this file", { status: 502 });
  }

  if (!upstream.ok && upstream.status !== 206) {
    return new Response("Unable to retrieve this file", { status: 502 });
  }

  const fileName = safeDownloadName(
    (asset && "fileName" in asset && asset.fileName) ||
      (photo?.caption ? `${photo.caption}${fileUrl.pathname.match(/\.[a-zA-Z0-9]+$/)?.[0] ?? ""}` : basename(file.filePath)),
  );
  const asciiName = fileName.replace(/[^\x20-\x7E]/g, "_");
  const headers = new Headers({
    "Content-Type": file.mimeType || "application/octet-stream",
    "Content-Disposition": `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
  });

  for (const headerName of ["accept-ranges", "content-length", "content-range"]) {
    const value = upstream.headers.get(headerName);
    if (value) headers.set(headerName, value);
  }

  return new Response(upstream.body, { status: upstream.status, headers });
}
