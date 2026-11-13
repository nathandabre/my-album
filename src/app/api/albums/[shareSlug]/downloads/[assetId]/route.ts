import { serveAlbumMedia } from "@/lib/album-media";

type DownloadRouteProps = {
  params: Promise<{ shareSlug: string; assetId: string }>;
};

export async function GET(request: Request, { params }: DownloadRouteProps) {
  const { shareSlug, assetId } = await params;
  return serveAlbumMedia(request, shareSlug, assetId, true);
}
