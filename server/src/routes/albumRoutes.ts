import { Router, RequestHandler } from "express";
import { AlbumController } from "../controllers/albumController";
import { requireAuth, AuthenticatedRequest } from "../middleware/auth";

const router = Router();

// Private photographer routes
router.get("/user", requireAuth, (async (req, res) => {
  await AlbumController.getUserAlbums(req as AuthenticatedRequest, res);
}) as RequestHandler);

router.get("/user/:id", requireAuth, (async (req, res) => {
  await AlbumController.getAlbumById(req as AuthenticatedRequest, res);
}) as RequestHandler);

router.post("/", requireAuth, (async (req, res) => {
  await AlbumController.createAlbum(req as AuthenticatedRequest, res);
}) as RequestHandler);

router.put("/:id", requireAuth, (async (req, res) => {
  await AlbumController.updateAlbum(req as AuthenticatedRequest, res);
}) as RequestHandler);

router.delete("/:id", requireAuth, (async (req, res) => {
  await AlbumController.deleteAlbum(req as AuthenticatedRequest, res);
}) as RequestHandler);

// Public guest routes
router.get("/public/:shareSlug", (async (req, res) => {
  await AlbumController.getPublicAlbum(req as AuthenticatedRequest, res);
}) as RequestHandler);

router.post("/public/:shareSlug/verify-password", (async (req, res) => {
  await AlbumController.verifyPassword(req as AuthenticatedRequest, res);
}) as RequestHandler);

export default router;

