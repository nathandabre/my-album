import { Suspense } from "react";
import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { Camera, Image as ImageIcon, Sparkles, FolderKanban } from "lucide-react";

import { prisma } from "@/lib/db";
import { getCurrentDbUser } from "@/lib/auth";
import { CreateAlbumDialog } from "@/components/dashboard/create-album-dialog";
import { AlbumCard, AlbumCardData } from "@/components/dashboard/album-card";

async function DashboardContent() {
  const { userId } = await auth();
  if (!userId) {
    redirect("/sign-in");
  }

  // Ensure DB user exists and synced
  const user = await getCurrentDbUser();
  if (!user) {
    redirect("/sign-in");
  }

  const albums = (await prisma.album.findMany({
    where: { ownerId: user.id },
    include: {
      coverPhoto: {
        select: { id: true, filePath: true },
      },
      _count: {
        select: { photos: true },
      },
    },
    orderBy: { createdAt: "desc" },
  })) as unknown as AlbumCardData[];

  const totalPhotos = albums.reduce((acc, curr) => acc + curr._count.photos, 0);

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 sm:px-6 py-8 sm:py-10">
      {/* Header & Actions */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between pb-8 border-b border-border">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-3xl font-bold tracking-tight text-foreground">
              Photographer Dashboard
            </h1>
            <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">
              Pro
            </span>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage your client photo galleries, configure downloads, and distribute private links.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <CreateAlbumDialog />
        </div>
      </div>

      {/* Quick Metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 my-8">
        <div className="rounded-2xl border border-border bg-card/60 p-4 shadow-sm backdrop-blur-sm">
          <div className="flex items-center gap-2 text-muted-foreground text-xs font-medium uppercase tracking-wider">
            <FolderKanban className="h-4 w-4 text-primary" />
            <span>Total Albums</span>
          </div>
          <div className="mt-2 text-2xl font-bold text-foreground">
            {albums.length}
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card/60 p-4 shadow-sm backdrop-blur-sm">
          <div className="flex items-center gap-2 text-muted-foreground text-xs font-medium uppercase tracking-wider">
            <ImageIcon className="h-4 w-4 text-primary" />
            <span>Uploaded Photos</span>
          </div>
          <div className="mt-2 text-2xl font-bold text-foreground">
            {totalPhotos}
          </div>
        </div>

        <div className="col-span-2 sm:col-span-1 rounded-2xl border border-border bg-card/60 p-4 shadow-sm backdrop-blur-sm">
          <div className="flex items-center gap-2 text-muted-foreground text-xs font-medium uppercase tracking-wider">
            <Sparkles className="h-4 w-4 text-primary" />
            <span>Client Ready</span>
          </div>
          <div className="mt-2 text-2xl font-bold text-foreground">
            {albums.filter((a) => a._count.photos > 0).length} active
          </div>
        </div>
      </div>

      {/* Album List */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold tracking-tight text-foreground">
            Your Albums
          </h2>
          <span className="text-xs text-muted-foreground">
            {albums.length} {albums.length === 1 ? "album" : "albums"} created
          </span>
        </div>

        {albums.length === 0 ? (
          <div className="flex min-h-[340px] flex-col items-center justify-center rounded-3xl border border-dashed border-border p-8 text-center bg-card/30">
            <div className="rounded-2xl bg-muted p-4 text-muted-foreground mb-4">
              <Camera className="h-8 w-8 text-foreground" />
            </div>
            <h3 className="text-lg font-semibold text-foreground">
              No albums yet
            </h3>
            <p className="mt-1.5 max-w-sm text-sm text-muted-foreground">
              Create your first album to upload high-resolution photos and send clients a stunning shareable link.
            </p>
            <div className="mt-6">
              <CreateAlbumDialog />
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {albums.map((album) => (
              <AlbumCard key={album.id} album={album} />
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

export default function DashboardPage() {
  return (
    <Suspense
      fallback={
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 sm:px-6 py-10 animate-pulse">
          <div className="h-10 w-64 rounded-xl bg-muted mb-4" />
          <div className="h-4 w-96 rounded-lg bg-muted mb-8" />
          <div className="grid grid-cols-3 gap-4 mb-8">
            <div className="h-24 rounded-2xl bg-muted" />
            <div className="h-24 rounded-2xl bg-muted" />
            <div className="h-24 rounded-2xl bg-muted" />
          </div>
          <div className="grid grid-cols-3 gap-6">
            <div className="h-64 rounded-2xl bg-muted" />
            <div className="h-64 rounded-2xl bg-muted" />
            <div className="h-64 rounded-2xl bg-muted" />
          </div>
        </main>
      }
    >
      <DashboardContent />
    </Suspense>
  );
}
