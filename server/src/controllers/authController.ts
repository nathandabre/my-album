import { Response } from "express";
import crypto from "node:crypto";
import { AuthenticatedRequest } from "../middleware/auth";

const DEFAULT_TIME_DIFF = 60 * 30; // 30 minutes

export const AuthController = {
  getUploadAuth(req: AuthenticatedRequest, res: Response) {
    const privateKey = process.env.IMAGEKIT_PRIVATE_KEY;
    const publicKey = process.env.NEXT_PUBLIC_IMAGEKIT_PUBLIC_KEY;

    if (!privateKey || !publicKey) {
      return res.status(500).json({ error: "ImageKit credentials missing on server" });
    }

    try {
      const defaultExpire = Math.floor(Date.now() / 1000) + DEFAULT_TIME_DIFF;
      const token = crypto.randomUUID();
      const expire = defaultExpire;

      const signature = crypto
        .createHmac("sha1", privateKey)
        .update(token + String(expire))
        .digest("hex");

      return res.json({ token, expire, signature, publicKey });
    } catch (err) {
      console.error("ImageKit auth error:", err);
      return res.status(500).json({ error: "Failed to generate upload authorization" });
    }
  },
};

