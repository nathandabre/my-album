import { Suspense } from "react";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { AlbumVisibility } from "@/generated/prisma/enums";
import { PasswordGate } from "@/components/gallery/password-gate";
import { PublicGallery } from "@/components/gallery/public-gallery";
import { getAlbumAccessDecision } from "@/lib/album-access";
import { getImageKitUrl } from "@/lib/imagekit";
import { prisma } from "@/lib/db";
import {
  encodeGalleryCursor,
  GALLERY_PAGE_SIZE,
} from "@/lib/gallery-pagination";

type PublicAlbumPageProps = {
  params: Promise<{ shareSlug: string }>;
};

const privateMetadata: Metadata = {
  title: "Gallery | my-album",
  description: "This gallery is private or unavailable.",
  robots: { index: false, follow: false },
};

async function findAccessRecord(shareSlug: string) {
  return prisma.album.findUnique({
    where: { shareSlug },
    select: {
      id: true,
      title: true,
      description: true,
      visibility: true,
      expiresAt: true,
      updatedAt: true,
      owner: { select: { clerkId: true } },
    },
  });
}

export async function generateMetadata({
  params,
}: PublicAlbumPageProps): Promise<Metadata> {
  const { shareSlug } = await params;
  const album = await findAccessRecord(shareSlug);
  if (!album || (await getAlbumAccessDecision(album)) !== "allowed") {
    return privateMetadata;
  }

  const details = await prisma.album.findUnique({
    where: { id: album.id },
    select: {
      owner: { select: { name: true } },
      coverPhoto: { select: { id: true, albumId: true, filePath: true } },
    },
  });
  const cover =
    album.visibility === AlbumVisibility.UNLISTED &&
    details?.coverPhoto?.albumId === album.id
    ? getImageKitUrl(details.coverPhoto.filePath, "w-1200,h-630,fo-auto,q-85")
    : undefined;
  const description =
    album.description ||
    `View photos from ${album.title} by ${details?.owner.name || "Photographer"}.`;

  return {
    title: `${album.title} | Photography Gallery`,
    description,
    robots: { index: false, follow: false },
    openGraph: {
      title: album.title,
      description,
      images: cover ? [{ url: cover }] : [],
    },
  };
}

async function PublicAlbumContent({ params }: PublicAlbumPageProps) {
  const { shareSlug } = await params;
  const albumAccess = await findAccessRecord(shareSlug);
  if (!albumAccess) notFound();

  const decision = await getAlbumAccessDecision(albumAccess);
  if (decision === "private" || decision === "expired") notFound();
  if (decision === "password-required") {
    return <PasswordGate shareSlug={shareSlug} />;
  }

  const album = await prisma.album.findUnique({
    where: { id: albumAccess.id },
    select: {
      id: true,
      title: true,
      description: true,
      shareSlug: true,
      visibility: true,
      expiresAt: true,
      updatedAt: true,
      allowDownload: true,
      owner: {
        select: { name: true, imageUrl: true, clerkId: true },
      },
      coverPhoto: {
        select: { id: true, albumId: true, filePath: true },
      },
      photos: {
        orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
        take: GALLERY_PAGE_SIZE + 1,
        select: {
          id: true,
          caption: true,
          width: true,
          height: true,
          sizeBytes: true,
          mimeType: true,
          sortOrder: true,
        },
      },
      _count: { select: { photos: true } },
    },
  });

  if (!album || (await getAlbumAccessDecision(album)) !== "allowed") {
    notFound();
  }

  const hasMorePhotos = album.photos.length > GALLERY_PAGE_SIZE;
  const photos = album.photos.slice(0, GALLERY_PAGE_SIZE);
  const lastPhoto = photos.at(-1);

  return (
    <PublicGallery
      album={{
        id: album.id,
        title: album.title,
        description: album.description,
        shareSlug: album.shareSlug,
        allowDownload: album.allowDownload,
        owner: { name: album.owner.name, imageUrl: album.owner.imageUrl },
        coverPhoto:
          album.coverPhoto?.albumId === album.id
            ? {
                id: album.coverPhoto.id,
              }
            : null,
        photos: photos.map((photo) => ({
          id: photo.id,
          caption: photo.caption,
          width: photo.width,
          height: photo.height,
          sizeBytes: photo.sizeBytes,
          mimeType: photo.mimeType,
        })),
        photoCount: album._count.photos,
        nextCursor:
          hasMorePhotos && lastPhoto ? encodeGalleryCursor(lastPhoto) : null,
      }}
    />
  );
}

export default function PublicAlbumPage({ params }: PublicAlbumPageProps) {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-7xl px-4 py-16 animate-pulse">
          <div className="mx-auto mb-4 h-6 w-48 rounded-full bg-muted" />
          <div className="mx-auto mb-6 h-12 w-96 rounded-2xl bg-muted" />
          <div className="mx-auto mb-12 h-4 w-64 rounded-lg bg-muted" />
          <div className="columns-1 gap-4 space-y-4 sm:columns-2 lg:columns-3">
            <div className="h-64 rounded-2xl bg-muted" />
            <div className="h-80 rounded-2xl bg-muted" />
            <div className="h-72 rounded-2xl bg-muted" />
          </div>
        </div>
      }
    >
      <PublicAlbumContent params={params} />
    </Suspense>
  );
}
