import type { AlbumVisibility } from "@/generated/prisma/enums";

export type PhotoFavorite = {
  id: string;
  guestName: string | null;
};

export type PhotoItem = {
  id: string;
  caption: string | null;
  width: number;
  height: number;
  sizeBytes: number;
  mimeType: string;
  sortOrder: number;
  favorites?: PhotoFavorite[];
};

export type AlbumDetail = {
  id: string;
  title: string;
  description: string | null;
  shareSlug: string;
  visibility: AlbumVisibility;
  allowDownload: boolean;
  coverPhotoId: string | null;
  coverPhoto: {
    id: string;
  } | null;
  expiresAt?: Date | null;
  createdAt: Date;
  photos: PhotoItem[];
};
