import { Suspense } from "react";
import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { auth } from "@clerk/nextjs/server";
import { Clock, EyeOff } from "lucide-react";
import type { Metadata } from "next";

import { prisma } from "@/lib/db";
import { AlbumVisibility } from "@/generated/prisma/enums";
import { PublicGallery } from "@/components/gallery/public-gallery";
import { PasswordGate } from "@/components/gallery/password-gate";
import { getImageKitUrl } from "@/lib/imagekit";

type PublicAlbumPageProps = {
  params: Promise<{ shareSlug: string }>;
};

export async function generateMetadata({
  params,
}: PublicAlbumPageProps): Promise<Metadata> {
  const { shareSlug } = await params;

  const album = await prisma.album.findUnique({
    where: { shareSlug },
    include: {
      owner: { select: { name: true } },
      coverPhoto: { select: { filePath: true } },
    },
  });

  if (!album) {
    return {
      title: "Album Not Found - my-album",
    };
  }

  const coverUrl = album.coverPhoto
    ? getImageKitUrl(album.coverPhoto.filePath, "w-1200,h-630,fo-auto,q-85")
    : undefined;

  return {
    title: `${album.title} | Photography Gallery`,
    description:
      album.description ||
      `View photos from ${album.title} by ${album.owner.name || "Photographer"}.`,
    openGraph: {
      title: album.title,
      description:
        album.description ||
        `View photos from ${album.title} by ${album.owner.name || "Photographer"}.`,
      images: coverUrl ? [{ url: coverUrl }] : [],
    },
  };
}

async function PublicAlbumContent({ params }: PublicAlbumPageProps) {
  const { shareSlug } = await params;
  const { userId } = await auth();

  const album = await prisma.album.findUnique({
    where: { shareSlug },
    include: {
      owner: {
        select: {
          name: true,
          imageUrl: true,
          clerkId: true,
        },
      },
      coverPhoto: {
        select: {
          id: true,
          filePath: true,
        },
      },
      photos: {
        orderBy: { sortOrder: "asc" },
        select: {
          id: true,
          filePath: true,
          caption: true,
          width: true,
          height: true,
          sizeBytes: true,
          mimeType: true,
        },
      },
    },
  });

  if (!album) {
    notFound();
  }

  const isOwner = Boolean(userId && album.owner.clerkId === userId);

  // Check expiration
  if (album.expiresAt && album.expiresAt < new Date() && !isOwner) {
    return (
      <main className="flex min-h-[60vh] flex-col items-center justify-center px-6 text-center">
        <div className="rounded-full bg-muted p-4 text-muted-foreground mb-4">
          <Clock className="h-8 w-8" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          Album Expired
        </h1>
        <p className="mt-2 max-w-md text-sm text-muted-foreground">
          This gallery link has expired and is no longer publicly accessible. Please contact the photographer for access.
        </p>
      </main>
    );
  }

  // Check Private visibility
  if (album.visibility === AlbumVisibility.PRIVATE && !isOwner) {
    return (
      <main className="flex min-h-[60vh] flex-col items-center justify-center px-6 text-center">
        <div className="rounded-full bg-muted p-4 text-muted-foreground mb-4">
          <EyeOff className="h-8 w-8" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          Private Album
        </h1>
        <p className="mt-2 max-w-md text-sm text-muted-foreground">
          This album is set to private and can only be viewed by its owner.
        </p>
      </main>
    );
  }

  // Check Password visibility
  if (album.visibility === AlbumVisibility.PASSWORD && !isOwner) {
    const cookieStore = await cookies();
    const isUnlocked = cookieStore.get(`unlocked_${shareSlug}`)?.value === "true";

    if (!isUnlocked) {
      return (
        <PasswordGate
          shareSlug={shareSlug}
          albumTitle={album.title}
        />
      );
    }
  }

  return <PublicGallery album={album} />;
}

export default function PublicAlbumPage({ params }: PublicAlbumPageProps) {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-7xl px-4 sm:px-6 py-16 animate-pulse">
          <div className="mx-auto h-6 w-48 rounded-full bg-muted mb-4" />
          <div className="mx-auto h-12 w-96 rounded-2xl bg-muted mb-6" />
          <div className="mx-auto h-4 w-64 rounded-lg bg-muted mb-12" />
          <div className="columns-1 sm:columns-2 lg:columns-3 gap-4 space-y-4">
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
