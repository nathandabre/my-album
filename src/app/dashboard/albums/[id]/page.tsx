import { Suspense } from "react";
import { redirect, notFound } from "next/navigation";
import { auth } from "@clerk/nextjs/server";

import { prisma } from "@/lib/db";
import { getCurrentDbUser } from "@/lib/auth";
import { AlbumEditor } from "@/components/albums/album-editor";

type AlbumPageProps = {
  params: Promise<{ id: string }>;
};

async function AlbumPageContent({ params }: AlbumPageProps) {
  const { id } = await params;
  const { userId } = await auth();

  if (!userId) {
    redirect("/sign-in");
  }

  const user = await getCurrentDbUser();
  if (!user) {
    redirect("/sign-in");
  }

  const album = await prisma.album.findFirst({
    where: {
      id,
      ownerId: user.id,
    },
    include: {
      coverPhoto: {
        select: { id: true, filePath: true },
      },
      photos: {
        orderBy: { sortOrder: "asc" },
        include: {
          favorites: true,
        },
      },
    },
  });

  if (!album) {
    notFound();
  }

  return <AlbumEditor album={album} />;
}

export default function AlbumManagePage({ params }: AlbumPageProps) {
  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 sm:px-6 py-8 sm:py-10">
      <Suspense
        fallback={
          <div className="space-y-6 animate-pulse">
            <div className="h-9 w-64 rounded-xl bg-muted" />
            <div className="h-10 w-48 rounded-xl bg-muted" />
            <div className="h-44 w-full rounded-2xl bg-muted" />
            <div className="grid grid-cols-3 gap-4">
              <div className="h-48 rounded-xl bg-muted" />
              <div className="h-48 rounded-xl bg-muted" />
              <div className="h-48 rounded-xl bg-muted" />
            </div>
          </div>
        }
      >
        <AlbumPageContent params={params} />
      </Suspense>
    </main>
  );
}
