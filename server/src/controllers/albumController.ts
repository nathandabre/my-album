import { Response } from "express";
import crypto from "node:crypto";
import { prisma } from "../config/db";
import { AuthenticatedRequest } from "../middleware/auth";
import { AlbumVisibility } from "@/generated/prisma/enums";

function generateSlug(title: string): string {
  const base = title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 30);
  const randomSuffix = crypto.randomBytes(3).toString("hex");
  return base ? `${base}-${randomSuffix}` : `album-${randomSuffix}`;
}

function hashPassword(plainText: string): string {
  return crypto.createHash("sha256").update(plainText.trim()).digest("hex");
}

export const AlbumController = {
  // Get all albums for the authenticated photographer
  async getUserAlbums(req: AuthenticatedRequest, res: Response) {
    try {
      const albums = await prisma.album.findMany({
        where: { ownerId: req.user!.id },
        include: {
          coverPhoto: { select: { id: true, filePath: true } },
          _count: { select: { photos: true } },
        },
        orderBy: { createdAt: "desc" },
      });
      return res.json({ success: true, albums });
    } catch (err) {
      console.error("getUserAlbums error:", err);
      return res.status(500).json({ error: "Failed to fetch albums" });
    }
  },

  // Get specific album by ID (with owner check)
  async getAlbumById(req: AuthenticatedRequest, res: Response) {
    try {
      const id = req.params.id as string;
      const album = await prisma.album.findFirst({
        where: { id, ownerId: req.user!.id },
        include: {
          photos: {
            orderBy: { sortOrder: "asc" },
            include: { favorites: true },
          },
        },
      });

      if (!album) {
        return res.status(404).json({ error: "Album not found" });
      }

      return res.json({ success: true, album });
    } catch (err) {
      console.error("getAlbumById error:", err);
      return res.status(500).json({ error: "Failed to fetch album" });
    }
  },

  // Create new album
  async createAlbum(req: AuthenticatedRequest, res: Response) {
    try {
      const { title, description, visibility, password, allowDownload, expiresAt } = req.body;
      const trimmedTitle = title?.trim();

      if (!trimmedTitle) {
        return res.status(400).json({ error: "Album title is required" });
      }

      const vis = visibility ?? AlbumVisibility.UNLISTED;
      let passwordHash: string | null = null;

      if (vis === AlbumVisibility.PASSWORD) {
        if (!password?.trim()) {
          return res.status(400).json({ error: "Password is required for password-protected albums" });
        }
        passwordHash = hashPassword(password);
      }

      let shareSlug = generateSlug(trimmedTitle);
      let attempts = 0;
      while (attempts < 5) {
        const existing = await prisma.album.findUnique({
          where: { shareSlug },
          select: { id: true },
        });
        if (!existing) break;
        shareSlug = generateSlug(trimmedTitle);
        attempts++;
      }

      const album = await prisma.album.create({
        data: {
          ownerId: req.user!.id,
          title: trimmedTitle,
          description: description?.trim() || null,
          shareSlug,
          visibility: vis,
          passwordHash,
          allowDownload: allowDownload ?? false,
          expiresAt: expiresAt ? new Date(expiresAt) : null,
        },
      });

      return res.status(201).json({ success: true, albumId: album.id, shareSlug: album.shareSlug });
    } catch (err) {
      console.error("createAlbum error:", err);
      return res.status(500).json({ error: "Failed to create album" });
    }
  },

  // Update album
  async updateAlbum(req: AuthenticatedRequest, res: Response) {
    try {
      const id = req.params.id as string;
      const { title, description, visibility, password, allowDownload, coverPhotoId, expiresAt } = req.body;

      const existing = await prisma.album.findFirst({
        where: { id, ownerId: req.user!.id },
      });

      if (!existing) {
        return res.status(404).json({ error: "Album not found or unauthorized" });
      }

      const updateData: {
        title?: string;
        description?: string | null;
        visibility?: AlbumVisibility;
        passwordHash?: string | null;
        allowDownload?: boolean;
        coverPhotoId?: string | null;
        expiresAt?: Date | null;
      } = {};
      if (title !== undefined) {
        const trimmed = title.trim();
        if (!trimmed) return res.status(400).json({ error: "Title cannot be empty" });
        updateData.title = trimmed;
      }
      if (description !== undefined) {
        updateData.description = description.trim() || null;
      }
      if (visibility !== undefined) {
        updateData.visibility = visibility;
        if (visibility === AlbumVisibility.PASSWORD) {
          if (password && password.trim()) {
            updateData.passwordHash = hashPassword(password);
          } else if (!existing.passwordHash) {
            return res.status(400).json({ error: "Password required for password-protected album" });
          }
        } else {
          updateData.passwordHash = null;
        }
      }
      if (allowDownload !== undefined) updateData.allowDownload = allowDownload;
      if (coverPhotoId !== undefined) updateData.coverPhotoId = coverPhotoId;
      if (expiresAt !== undefined) updateData.expiresAt = expiresAt ? new Date(expiresAt) : null;

      const updated = await prisma.album.update({
        where: { id },
        data: updateData,
      });

      return res.json({ success: true, album: updated });
    } catch (err) {
      console.error("updateAlbum error:", err);
      return res.status(500).json({ error: "Failed to update album" });
    }
  },

  // Delete album
  async deleteAlbum(req: AuthenticatedRequest, res: Response) {
    try {
      const id = req.params.id as string;
      const existing = await prisma.album.findFirst({
        where: { id, ownerId: req.user!.id },
      });

      if (!existing) {
        return res.status(404).json({ error: "Album not found or unauthorized" });
      }

      await prisma.album.delete({ where: { id } });
      return res.json({ success: true });
    } catch (err) {
      console.error("deleteAlbum error:", err);
      return res.status(500).json({ error: "Failed to delete album" });
    }
  },

  // Public: Get album by share slug
  async getPublicAlbum(req: AuthenticatedRequest, res: Response) {
    try {
      const shareSlug = req.params.shareSlug as string;
      const album = await prisma.album.findUnique({
        where: { shareSlug },
        include: {
          owner: {
            select: { name: true, imageUrl: true, clerkId: true },
          },
          photos: {
            orderBy: { sortOrder: "asc" },
            select: {
              id: true,
              filePath: true,
              caption: true,
              width: true,
              height: true,
              sizeBytes: true,
              mimeType: true,
            },
          },
        },
      });

      if (!album) {
        return res.status(404).json({ error: "Album not found" });
      }

      return res.json({ success: true, album });
    } catch (err) {
      console.error("getPublicAlbum error:", err);
      return res.status(500).json({ error: "Failed to fetch public gallery" });
    }
  },

  // Public: Verify album password
  async verifyPassword(req: AuthenticatedRequest, res: Response) {
    try {
      const shareSlug = req.params.shareSlug as string;
      const { password } = req.body;

      const album = await prisma.album.findUnique({
        where: { shareSlug },
        select: { id: true, visibility: true, passwordHash: true },
      });

      if (!album) {
        return res.status(404).json({ error: "Album not found" });
      }

      if (album.visibility !== AlbumVisibility.PASSWORD) {
        return res.json({ success: true });
      }

      const hashed = hashPassword(password || "");
      if (hashed !== album.passwordHash) {
        return res.status(401).json({ error: "Incorrect password. Please try again." });
      }

      return res.json({ success: true });
    } catch (err) {
      console.error("verifyPassword error:", err);
      return res.status(500).json({ error: "Verification failed" });
    }
  },
};
