import { createHmac } from "node:crypto";

export function getAlbumPasswordAttemptKey(albumId: string, secret: string) {
  return createHmac("sha256", secret)
    .update("my-album:password-attempt:v2:")
    .update(albumId)
    .digest("hex");
}
