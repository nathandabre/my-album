import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import albumRoutes from "./routes/albumRoutes";
import photoRoutes from "./routes/photoRoutes";
import authRoutes from "./routes/authRoutes";

dotenv.config();

const app = express();
const port = process.env.PORT || 5000;

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

// Health check
app.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Mount MVC Routes
app.use("/api/albums", albumRoutes);
app.use("/api/albums", photoRoutes);
app.use("/api/auth", authRoutes);

app.listen(port, () => {
  console.log(`[Express Backend] Running on http://localhost:${port}`);
});

export default app;

