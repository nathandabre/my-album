export function getAlbumMediaUrl(
  shareSlug: string,
  assetId: string,
  transformations?: string,
) {
  const url = `/api/albums/${encodeURIComponent(shareSlug)}/media/${encodeURIComponent(assetId)}`;
  if (!transformations) return url;
  return `${url}?tr=${encodeURIComponent(transformations)}`;
}
