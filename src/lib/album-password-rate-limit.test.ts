import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  attempt: null as null | {
    id: string;
    failedAttempts: number;
    windowStartedAt: Date;
    lockedUntil: Date | null;
  },
  rawCalls: [] as { query: string; values: unknown[] }[],
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({
  prisma: {
    $executeRaw: vi.fn(async (
      strings: TemplateStringsArray,
      ...values: unknown[]
    ) => {
      state.rawCalls.push({ query: strings.join("?"), values });
      const [id, albumId, clientKey, now] = values;
      if (
        typeof id !== "string" ||
        typeof albumId !== "string" ||
        typeof clientKey !== "string" ||
        !(now instanceof Date)
      ) {
        throw new Error("Unexpected atomic password-attempt query parameters");
      }

      const previous = state.attempt;
      const resetWindow =
        !previous ||
        now.getTime() - previous.windowStartedAt.getTime() >= 15 * 60 * 1000;
      const failedAttempts = resetWindow
        ? 1
        : previous.failedAttempts + 1;
      state.attempt = {
        id: previous?.id ?? id,
        failedAttempts,
        windowStartedAt: resetWindow
          ? now
          : previous.windowStartedAt,
        lockedUntil:
          failedAttempts >= 5
            ? new Date(now.getTime() + 15 * 60 * 1000)
            : resetWindow
              ? null
              : previous.lockedUntil,
      };
      return 1;
    }),
    albumPasswordAttempt: {
      findUnique: vi.fn(async () => state.attempt),
      deleteMany: vi.fn(async () => {
        state.attempt = null;
        return { count: 1 };
      }),
    },
  },
}));

import {
  clearPasswordAttempts,
  isPasswordAttemptLocked,
  recordFailedPasswordAttempt,
} from "@/lib/album-password-rate-limit";

describe("album password attempt lockout", () => {
  const albumId = "album-a";
  const clientKey = "stable-account-level-key";
  const start = new Date("2026-01-01T00:00:00.000Z");

  beforeEach(() => {
    state.attempt = null;
    state.rawCalls = [];
  });

  it("locks after repeated failures and expires the lock after fifteen minutes", async () => {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await recordFailedPasswordAttempt(
        albumId,
        clientKey,
        new Date(start.getTime() + attempt * 1000),
      );
    }

    expect(state.rawCalls).toHaveLength(5);
    expect(state.rawCalls[0]?.query).toContain(
      'ON CONFLICT ("albumId", "clientKey") DO UPDATE',
    );
    expect(state.rawCalls[0]?.query).toContain('"failedAttempts" + 1');
    expect(await isPasswordAttemptLocked(
      albumId,
      clientKey,
      new Date(start.getTime() + 14 * 60 * 1000),
    )).toBe(true);
    expect(await isPasswordAttemptLocked(
      albumId,
      clientKey,
      new Date(start.getTime() + 16 * 60 * 1000),
    )).toBe(false);
  });

  it("resets the failure window after fifteen minutes and clears on success", async () => {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      await recordFailedPasswordAttempt(
        albumId,
        clientKey,
        new Date(start.getTime() + attempt * 1000),
      );
    }
    await recordFailedPasswordAttempt(
      albumId,
      clientKey,
      new Date(start.getTime() + 16 * 60 * 1000),
    );
    expect(state.attempt?.failedAttempts).toBe(1);
    await clearPasswordAttempts(albumId, clientKey);
    expect(await isPasswordAttemptLocked(albumId, clientKey, start)).toBe(false);
  });
});
