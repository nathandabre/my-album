import { getUploadAuthParams } from "@imagekit/next/server";
import { z } from "zod";

import { getCurrentDbUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

const requestSchema = z.object({
  albumId: z.string().trim().min(1).max(128),
});

function jsonResponse(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) {
    return jsonResponse({ error: "Forbidden" }, 403);
  }

  if (!request.headers.get("content-type")?.startsWith("application/json")) {
    return jsonResponse({ error: "Invalid request" }, 400);
  }
  const user = await getCurrentDbUser();
  if (!user) return jsonResponse({ error: "Unauthorized" }, 401);

  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > 2048) return jsonResponse({ error: "Invalid request" }, 400);

  const reader = request.body?.getReader();
  if (!reader) return jsonResponse({ error: "Invalid request" }, 400);
  const chunks: Uint8Array[] = [];
  let bodySize = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bodySize += value.byteLength;
      if (bodySize > 2048) {
        await reader.cancel();
        return jsonResponse({ error: "Invalid request" }, 400);
      }
      chunks.push(value);
    }
  } catch {
    return jsonResponse({ error: "Invalid request" }, 400);
  }
  let body: unknown;
  try {
    body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    return jsonResponse({ error: "Invalid request" }, 400);
  }
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) return jsonResponse({ error: "Invalid request" }, 400);

  const album = await prisma.album.findFirst({
    where: { id: parsed.data.albumId, ownerId: user.id },
    select: { id: true },
  });
  if (!album) return jsonResponse({ error: "Album not found" }, 404);

  const privateKey = process.env.IMAGEKIT_PRIVATE_KEY;
  const publicKey = process.env.NEXT_PUBLIC_IMAGEKIT_PUBLIC_KEY;
  if (!privateKey || !publicKey) {
    return jsonResponse({ error: "ImageKit is not configured" }, 503);
  }

  const { token, expire, signature } = getUploadAuthParams({
    privateKey,
    publicKey,
    expire: Math.floor(Date.now() / 1000) + 5 * 60,
  });
  return jsonResponse({
    token,
    expire,
    signature,
    publicKey,
    folder: `/albums/${album.id}`,
  });
}
