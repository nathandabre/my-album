import "server-only";

import { auth } from "@clerk/nextjs/server";
import { cookies } from "next/headers";

import { albumAccessCookieName } from "@/lib/album-token";
import {
  evaluateAlbumAccess,
  type AlbumAccessDecision,
  type AlbumAccessRecord,
} from "@/lib/album-access-policy";

export async function getAlbumAuthorization(
  album: AlbumAccessRecord,
): Promise<{ decision: AlbumAccessDecision; isOwner: boolean }> {
  const [{ userId }, cookieStore] = await Promise.all([auth(), cookies()]);
  const secret = process.env.CLERK_SECRET_KEY;
  if (!secret) throw new Error("CLERK_SECRET_KEY is not configured");

  const isOwner = Boolean(userId && userId === album.owner.clerkId);
  const decision = evaluateAlbumAccess(album, {
    userId,
    accessToken: cookieStore.get(albumAccessCookieName(album.id))?.value,
    secret,
  });
  return { decision, isOwner };
}

export async function getAlbumAccessDecision(
  album: AlbumAccessRecord,
): Promise<AlbumAccessDecision> {
  return (await getAlbumAuthorization(album)).decision;
}
