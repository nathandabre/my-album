import { Router, RequestHandler } from "express";
import { PhotoController } from "../controllers/photoController";
import { requireAuth, AuthenticatedRequest } from "../middleware/auth";

const router = Router();

// Private photographer routes
router.post("/:albumId/photos", requireAuth, (async (req, res) => {
  await PhotoController.addPhotos(req as AuthenticatedRequest, res);
}) as RequestHandler);

router.delete("/:albumId/photos/:photoId", requireAuth, (async (req, res) => {
  await PhotoController.deletePhoto(req as AuthenticatedRequest, res);
}) as RequestHandler);

router.patch("/:albumId/photos/:photoId/cover", requireAuth, (async (req, res) => {
  await PhotoController.setCover(req as AuthenticatedRequest, res);
}) as RequestHandler);

router.patch("/:albumId/photos/:photoId/caption", requireAuth, (async (req, res) => {
  await PhotoController.updateCaption(req as AuthenticatedRequest, res);
}) as RequestHandler);

// Public guest routes
router.post("/photos/:photoId/favorite", (async (req, res) => {
  await PhotoController.toggleFavorite(req, res);
}) as RequestHandler);

router.post("/photos/guest-favorites", (async (req, res) => {
  await PhotoController.getGuestFavorites(req, res);
}) as RequestHandler);

export default router;
