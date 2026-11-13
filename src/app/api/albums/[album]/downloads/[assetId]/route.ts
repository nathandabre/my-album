import { serveAlbumMedia } from "@/lib/album-media";

type DownloadRouteProps = {
  params: Promise<{ album: string; assetId: string }>;
};

export async function GET(request: Request, { params }: DownloadRouteProps) {
  const { album: shareSlug, assetId } = await params;
  return serveAlbumMedia(request, shareSlug, assetId, true);
}
