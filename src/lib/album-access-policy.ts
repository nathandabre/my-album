import { AlbumVisibility } from "@/generated/prisma/enums";
import {
  verifyAlbumAccessToken,
} from "@/lib/album-token";

export type AlbumAccessRecord = {
  id: string;
  visibility: AlbumVisibility;
  expiresAt: Date | null;
  updatedAt: Date;
  owner: { clerkId: string };
};

export type AlbumAccessDecision =
  | "allowed"
  | "password-required"
  | "private"
  | "expired";

export function evaluateAlbumAccess(
  album: AlbumAccessRecord,
  options: {
    userId: string | null;
    accessToken?: string;
    secret: string;
    now?: Date;
  },
): AlbumAccessDecision {
  const isOwner = Boolean(options.userId && options.userId === album.owner.clerkId);
  const now = options.now ?? new Date();

  if (!isOwner && album.expiresAt && album.expiresAt <= now) return "expired";
  if (!isOwner && album.visibility === AlbumVisibility.PRIVATE) return "private";
  if (
    !isOwner &&
    album.visibility === AlbumVisibility.PASSWORD &&
    !verifyAlbumAccessToken(
      options.accessToken,
      album.id,
      album.updatedAt.getTime(),
      options.secret,
      Math.floor(now.getTime() / 1000),
    )
  ) {
    return "password-required";
  }

  return "allowed";
}
