import { connection } from "next/server";

import { prisma } from "@/lib/db";

export async function GET() {
  await connection();
  try {
    await prisma.$queryRaw`SELECT 1`;
    return Response.json(
      { status: "ok" },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("Health check database query failed", {
      errorType: error instanceof Error ? error.name : "UnknownError",
    });
    return Response.json(
      { status: "unavailable" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
