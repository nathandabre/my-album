import { Request, RequestHandler } from "express";
import { prisma } from "../config/db";

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    clerkId: string;
    email: string;
    name: string | null;
  };
}

export const requireAuth: RequestHandler = async (req, res, next) => {
  const clerkId = req.headers["x-user-id"] as string;

  if (!clerkId) {
    res.status(401).json({ error: "Unauthorized: Missing authentication" });
    return;
  }

  try {
    const user = await prisma.user.findUnique({
      where: { clerkId },
    });

    if (!user) {
      res.status(401).json({ error: "User not found or not synced" });
      return;
    }

    (req as AuthenticatedRequest).user = user;
    next();
  } catch (err) {
    console.error("Auth middleware error:", err);
    res.status(500).json({ error: "Internal authentication error" });
  }
};
