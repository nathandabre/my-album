import { serveAlbumMedia } from "@/lib/album-media";

type AlbumMediaRouteProps = {
  params: Promise<{ album: string; assetId: string }>;
};

export async function GET(request: Request, { params }: AlbumMediaRouteProps) {
  const { album: shareSlug, assetId } = await params;
  return serveAlbumMedia(request, shareSlug, assetId, false);
}
