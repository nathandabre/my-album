import "server-only";

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

const COOKIE_NAME = "my-album-guest";
const SESSION_LIFETIME_SECONDS = 90 * 24 * 60 * 60;

type GuestPayload = { id: string; expiresAt: number };

function sign(payload: string, secret: string) {
  return createHmac("sha256", secret)
    .update("my-album:guest-session:v1:")
    .update(payload)
    .digest();
}

function createToken(id: string, secret: string, nowSeconds: number) {
  const payload = Buffer.from(
    JSON.stringify({ id, expiresAt: nowSeconds + SESSION_LIFETIME_SECONDS }),
  ).toString("base64url");
  return `${payload}.${sign(payload, secret).toString("base64url")}`;
}

function verifyToken(token: string, secret: string, nowSeconds: number) {
  if (token.length > 1024) return null;
  const [payload, encodedSignature, ...extraParts] = token.split(".");
  if (!payload || !encodedSignature || extraParts.length > 0) return null;

  try {
    const expected = sign(payload, secret);
    const actual = Buffer.from(encodedSignature, "base64url");
    if (
      actual.length !== expected.length ||
      !timingSafeEqual(actual, expected)
    ) {
      return null;
    }
    const decoded: unknown = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8"),
    );
    if (
      !decoded ||
      typeof decoded !== "object" ||
      !("id" in decoded) ||
      !("expiresAt" in decoded) ||
      typeof decoded.id !== "string" ||
      typeof decoded.expiresAt !== "number" ||
      !Number.isSafeInteger(decoded.expiresAt) ||
      decoded.expiresAt <= nowSeconds
    ) {
      return null;
    }
    return decoded as GuestPayload;
  } catch {
    return null;
  }
}

export async function getGuestSessionId() {
  const secret = process.env.CLERK_SECRET_KEY;
  if (!secret) throw new Error("CLERK_SECRET_KEY is not configured");

  const cookieStore = await cookies();
  const nowSeconds = Math.floor(Date.now() / 1000);
  const existing = cookieStore.get(COOKIE_NAME)?.value;
  const session = existing ? verifyToken(existing, secret, nowSeconds) : null;
  if (session) return session.id;

  const id = randomBytes(32).toString("hex");
  cookieStore.set(COOKIE_NAME, createToken(id, secret, nowSeconds), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_LIFETIME_SECONDS,
  });
  return id;
}
