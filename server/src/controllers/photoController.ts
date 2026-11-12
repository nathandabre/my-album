import { Request, Response } from "express";
import { prisma } from "../config/db";
import { AuthenticatedRequest } from "../middleware/auth";

export const PhotoController = {
  // Add uploaded photos to an album
  async addPhotos(req: AuthenticatedRequest, res: Response) {
    try {
      const albumId = req.params.albumId as string;
      const { photos } = req.body;

      if (!photos || !Array.isArray(photos) || photos.length === 0) {
        return res.status(400).json({ error: "No photos provided" });
      }

      const album = await prisma.album.findFirst({
        where: { id: albumId, ownerId: req.user!.id },
        select: { id: true, coverPhotoId: true },
      });

      if (!album) {
        return res.status(404).json({ error: "Album not found or unauthorized" });
      }

      const lastPhoto = await prisma.photo.findFirst({
        where: { albumId },
        orderBy: { sortOrder: "desc" },
        select: { sortOrder: true },
      });

      let currentOrder = (lastPhoto?.sortOrder ?? -1) + 1;
      const createdPhotos = [];

      for (const item of photos) {
        const photo = await prisma.photo.create({
          data: {
            albumId,
            imagekitFileId: item.imagekitFileId,
            filePath: item.filePath,
            caption: item.caption?.trim() || null,
            width: item.width || 1200,
            height: item.height || 800,
            sizeBytes: item.sizeBytes || 0,
            mimeType: item.mimeType || "image/jpeg",
            sortOrder: currentOrder++,
          },
        });
        createdPhotos.push(photo);
      }

      if (!album.coverPhotoId && createdPhotos[0]) {
        await prisma.album.update({
          where: { id: albumId },
          data: { coverPhotoId: createdPhotos[0].id },
        });
      }

      return res.status(201).json({ success: true, count: createdPhotos.length, photos: createdPhotos });
    } catch (err) {
      console.error("addPhotos error:", err);
      return res.status(500).json({ error: "Failed to add photos" });
    }
  },

  // Delete photo
  async deletePhoto(req: AuthenticatedRequest, res: Response) {
    try {
      const albumId = req.params.albumId as string;
      const photoId = req.params.photoId as string;

      const album = await prisma.album.findFirst({
        where: { id: albumId, ownerId: req.user!.id },
        select: { id: true, coverPhotoId: true },
      });

      if (!album) {
        return res.status(404).json({ error: "Album not found or unauthorized" });
      }

      if (album.coverPhotoId === photoId) {
        const nextPhoto = await prisma.photo.findFirst({
          where: { albumId, id: { not: photoId } },
          orderBy: { sortOrder: "asc" },
          select: { id: true },
        });

        await prisma.album.update({
          where: { id: albumId },
          data: { coverPhotoId: nextPhoto?.id ?? null },
        });
      }

      await prisma.photo.delete({
        where: { id: photoId, albumId },
      });

      return res.json({ success: true });
    } catch (err) {
      console.error("deletePhoto error:", err);
      return res.status(500).json({ error: "Failed to delete photo" });
    }
  },

  // Set album cover
  async setCover(req: AuthenticatedRequest, res: Response) {
    try {
      const albumId = req.params.albumId as string;
      const photoId = req.params.photoId as string;

      const album = await prisma.album.findFirst({
        where: { id: albumId, ownerId: req.user!.id },
      });

      if (!album) {
        return res.status(404).json({ error: "Album not found or unauthorized" });
      }

      await prisma.album.update({
        where: { id: albumId },
        data: { coverPhotoId: photoId },
      });

      return res.json({ success: true });
    } catch (err) {
      console.error("setCover error:", err);
      return res.status(500).json({ error: "Failed to set cover photo" });
    }
  },

  // Update caption
  async updateCaption(req: AuthenticatedRequest, res: Response) {
    try {
      const albumId = req.params.albumId as string;
      const photoId = req.params.photoId as string;
      const { caption } = req.body;

      const album = await prisma.album.findFirst({
        where: { id: albumId, ownerId: req.user!.id },
      });

      if (!album) {
        return res.status(404).json({ error: "Unauthorized" });
      }

      const updated = await prisma.photo.update({
        where: { id: photoId, albumId },
        data: { caption: caption ? caption.trim() : null },
      });

      return res.json({ success: true, photo: updated });
    } catch (err) {
      console.error("updateCaption error:", err);
      return res.status(500).json({ error: "Failed to update photo caption" });
    }
  },

  // Guest Favorite Toggle
  async toggleFavorite(req: Request, res: Response) {
    try {
      const photoId = req.params.photoId as string;
      const { guestId, guestName } = req.body;

      if (!photoId || !guestId) {
        return res.status(400).json({ error: "Missing required parameters" });
      }

      const existing = await prisma.albumFavorite.findUnique({
        where: {
          photoId_guestId: { photoId, guestId },
        },
      });

      if (existing) {
        await prisma.albumFavorite.delete({ where: { id: existing.id } });
        return res.json({ success: true, isFavorited: false });
      } else {
        await prisma.albumFavorite.create({
          data: {
            photoId,
            guestId,
            guestName: guestName?.trim() || null,
          },
        });
        return res.json({ success: true, isFavorited: true });
      }
    } catch (err) {
      console.error("toggleFavorite error:", err);
      return res.status(500).json({ error: "Failed to toggle favorite" });
    }
  },

  // Get guest favorites
  async getGuestFavorites(req: Request, res: Response) {
    try {
      const { photoIds, guestId } = req.body;

      if (!guestId || !Array.isArray(photoIds) || photoIds.length === 0) {
        return res.json({ success: true, favorites: [] });
      }

      const favorites = await prisma.albumFavorite.findMany({
        where: {
          guestId,
          photoId: { in: photoIds },
        },
        select: { photoId: true },
      });

      return res.json({ success: true, favorites: favorites.map((f: { photoId: string }) => f.photoId) });
    } catch (err) {
      console.error("getGuestFavorites error:", err);
      return res.status(500).json({ error: "Failed to get guest favorites" });
    }
  },
};
