import { Router, RequestHandler } from "express";
import { AuthController } from "../controllers/authController";
import { requireAuth, AuthenticatedRequest } from "../middleware/auth";

const router = Router();

router.get("/upload-auth", requireAuth, ((req, res) => {
  AuthController.getUploadAuth(req as AuthenticatedRequest, res);
}) as RequestHandler);

export default router;
