type PublicAlbumPageProps = {
  params: Promise<{ shareSlug: string }>;
};

export default async function PublicAlbumPage({
  params,
}: PublicAlbumPageProps) {
  const { shareSlug } = await params;

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-10">
      <h1 className="text-2xl font-semibold tracking-tight">Shared album</h1>
      <p className="mt-2 text-muted-foreground">
        Public gallery for slug: <code>{shareSlug}</code>
      </p>
    </main>
  );
}
