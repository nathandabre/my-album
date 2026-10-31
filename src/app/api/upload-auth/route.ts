import { auth } from "@clerk/nextjs/server";
import { getUploadAuthParams } from "@imagekit/next/server";

export async function GET() {
  const { userId } = await auth();

  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const privateKey = process.env.IMAGEKIT_PRIVATE_KEY;
  const publicKey = process.env.NEXT_PUBLIC_IMAGEKIT_PUBLIC_KEY;

  if (!privateKey || !publicKey) {
    return Response.json(
      { error: "ImageKit is not configured" },
      { status: 500 },
    );
  }

  const { token, expire, signature } = getUploadAuthParams({
    privateKey,
    publicKey,
  });

  return Response.json({ token, expire, signature, publicKey });
}
