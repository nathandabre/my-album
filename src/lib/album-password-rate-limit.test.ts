import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  attempt: null as null | {
    id: string;
    failedAttempts: number;
    windowStartedAt: Date;
    lockedUntil: Date | null;
  },
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({
  prisma: {
    albumPasswordAttempt: {
      findUnique: vi.fn(async () => state.attempt),
      upsert: vi.fn(async ({ create, update }: {
        create: {
          failedAttempts: number;
          windowStartedAt: Date;
        };
        update: {
          failedAttempts?: number | { increment: number };
          windowStartedAt?: Date;
          lockedUntil?: null;
        };
      }) => {
        if (!state.attempt) {
          state.attempt = {
            id: "attempt",
            failedAttempts: create.failedAttempts,
            windowStartedAt: create.windowStartedAt,
            lockedUntil: null,
          };
        } else {
          state.attempt = {
            ...state.attempt,
            failedAttempts:
              typeof update.failedAttempts === "object"
                ? state.attempt.failedAttempts + update.failedAttempts.increment
                : update.failedAttempts ?? state.attempt.failedAttempts,
            windowStartedAt:
              update.windowStartedAt ?? state.attempt.windowStartedAt,
            lockedUntil: update.lockedUntil ?? state.attempt.lockedUntil,
          };
        }
        return {
          id: state.attempt.id,
          failedAttempts: state.attempt.failedAttempts,
        };
      }),
      update: vi.fn(async ({ data }: { data: { lockedUntil: Date } }) => {
        if (state.attempt) state.attempt.lockedUntil = data.lockedUntil;
      }),
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
  });

  it("locks after repeated failures and expires the lock after fifteen minutes", async () => {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await recordFailedPasswordAttempt(
        albumId,
        clientKey,
        new Date(start.getTime() + attempt * 1000),
      );
    }

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
