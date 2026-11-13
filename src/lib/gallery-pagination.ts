import { z } from "zod";

export const GALLERY_PAGE_SIZE = 50;

export const galleryCursorSchema = z
  .string()
  .max(160)
  .regex(/^-?\d{1,10}:[A-Za-z0-9_-]{1,128}$/);

export type GalleryCursor = {
  sortOrder: number;
  id: string;
};

export function encodeGalleryCursor(photo: GalleryCursor) {
  return `${photo.sortOrder}:${photo.id}`;
}

export function decodeGalleryCursor(value: string): GalleryCursor | null {
  const parsed = galleryCursorSchema.safeParse(value);
  if (!parsed.success) return null;
  const separator = parsed.data.indexOf(":");
  const sortOrder = Number(parsed.data.slice(0, separator));
  if (!Number.isSafeInteger(sortOrder)) return null;
  return { sortOrder, id: parsed.data.slice(separator + 1) };
}

export function appendUniquePhotos<T extends { id: string }>(
  current: T[],
  incoming: T[],
) {
  const seen = new Set(current.map((photo) => photo.id));
  const result = [...current];
  for (const photo of incoming) {
    if (seen.has(photo.id)) continue;
    seen.add(photo.id);
    result.push(photo);
  }
  return result;
}
