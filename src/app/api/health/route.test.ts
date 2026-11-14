import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  queryRaw: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: { $queryRaw: mocks.queryRaw },
}));
vi.mock("next/server", () => ({
  connection: vi.fn(async () => {}),
}));

import { GET } from "@/app/api/health/route";

describe("health route", () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it("returns ok after a successful database query", async () => {
    mocks.queryRaw.mockResolvedValue([{ "?column?": 1 }]);

    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ status: "ok" });
    expect(mocks.queryRaw).toHaveBeenCalledOnce();
  });

  it("returns 503 when the database query fails", async () => {
    mocks.queryRaw.mockRejectedValue(new Error("database unavailable"));
    vi.spyOn(console, "error").mockImplementation(() => {});

    const response = await GET();

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ status: "unavailable" });
    expect(console.error).toHaveBeenCalledOnce();
  });
});
