import { createHmac, timingSafeEqual } from "node:crypto";

const TOKEN_LIFETIME_SECONDS = 12 * 60 * 60;

type AlbumTokenPayload = {
  albumId: string;
  revision: number;
  expiresAt: number;
};

function signature(payload: string, secret: string) {
  return createHmac("sha256", secret)
    .update("my-album:album-access:v1:")
    .update(payload)
    .digest();
}

export function albumAccessCookieName(albumId: string) {
  return `album-access-${albumId}`;
}

export function createAlbumAccessToken(
  albumId: string,
  revision: number,
  secret: string,
  nowSeconds = Math.floor(Date.now() / 1000),
) {
  const payload: AlbumTokenPayload = {
    albumId,
    revision,
    expiresAt: nowSeconds + TOKEN_LIFETIME_SECONDS,
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const encodedSignature = signature(encodedPayload, secret).toString("base64url");
  return `${encodedPayload}.${encodedSignature}`;
}

export function verifyAlbumAccessToken(
  token: string | undefined,
  albumId: string,
  revision: number,
  secret: string,
  nowSeconds = Math.floor(Date.now() / 1000),
) {
  if (!token || token.length > 1024) return false;

  const [encodedPayload, encodedSignature, ...extraParts] = token.split(".");
  if (!encodedPayload || !encodedSignature || extraParts.length > 0) return false;

  let actualSignature: Buffer;
  let payload: AlbumTokenPayload;
  try {
    actualSignature = Buffer.from(encodedSignature, "base64url");
    const expectedSignature = signature(encodedPayload, secret);
    if (
      actualSignature.length !== expectedSignature.length ||
      !timingSafeEqual(actualSignature, expectedSignature)
    ) {
      return false;
    }

    const decoded: unknown = JSON.parse(
      Buffer.from(encodedPayload, "base64url").toString("utf8"),
    );
    if (
      !decoded ||
      typeof decoded !== "object" ||
      !("albumId" in decoded) ||
      !("revision" in decoded) ||
      !("expiresAt" in decoded) ||
      typeof decoded.albumId !== "string" ||
      typeof decoded.revision !== "number" ||
      !Number.isSafeInteger(decoded.revision) ||
      typeof decoded.expiresAt !== "number" ||
      !Number.isSafeInteger(decoded.expiresAt)
    ) {
      return false;
    }
    payload = decoded as AlbumTokenPayload;
  } catch {
    return false;
  }

  return (
    payload.albumId === albumId &&
    payload.revision === revision &&
    payload.expiresAt > nowSeconds &&
    payload.expiresAt <= nowSeconds + TOKEN_LIFETIME_SECONDS
  );
}
