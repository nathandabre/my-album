import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";

import { AlbumVisibility } from "@/generated/prisma/enums";
import { evaluateAlbumAccess } from "@/lib/album-access-policy";
import { hashAlbumPassword, verifyAlbumPassword } from "@/lib/album-password";
import { createAlbumAccessToken, verifyAlbumAccessToken } from "@/lib/album-token";

const secret = "test-signing-key-that-is-not-used-outside-tests";
const now = new Date("2026-11-13T12:00:00.000Z");
const album = {
  id: "album-1",
  visibility: AlbumVisibility.PASSWORD,
  expiresAt: null,
  updatedAt: new Date("2026-11-13T11:00:00.000Z"),
  owner: { clerkId: "clerk-owner" },
};

describe("album access token", () => {
  it("accepts a token only for its album and current revision", () => {
    const token = createAlbumAccessToken(
      album.id,
      album.updatedAt.getTime(),
      secret,
      Math.floor(now.getTime() / 1000),
    );

    expect(
      verifyAlbumAccessToken(
        token,
        album.id,
        album.updatedAt.getTime(),
        secret,
        Math.floor(now.getTime() / 1000) + 1,
      ),
    ).toBe(true);
    expect(
      verifyAlbumAccessToken(
        token,
        "another-album",
        album.updatedAt.getTime(),
        secret,
        Math.floor(now.getTime() / 1000) + 1,
      ),
    ).toBe(false);
    expect(
      verifyAlbumAccessToken(
        `${token.slice(0, -1)}x`,
        album.id,
        album.updatedAt.getTime(),
        secret,
        Math.floor(now.getTime() / 1000) + 1,
      ),
    ).toBe(false);
  });

  it("rejects expired tokens and invalidates tokens after album updates", () => {
    const issuedAt = Math.floor(now.getTime() / 1000);
    const token = createAlbumAccessToken(
      album.id,
      album.updatedAt.getTime(),
      secret,
      issuedAt,
    );

    expect(
      verifyAlbumAccessToken(
        token,
        album.id,
        album.updatedAt.getTime(),
        secret,
        issuedAt + 12 * 60 * 60,
      ),
    ).toBe(false);
    expect(
      evaluateAlbumAccess(
        { ...album, updatedAt: new Date(album.updatedAt.getTime() + 1) },
        { userId: null, accessToken: token, secret, now },
      ),
    ).toBe("password-required");
  });
});

describe("album access policy", () => {
  it("enforces private, password, expiry and owner access", () => {
    expect(
      evaluateAlbumAccess(album, { userId: null, secret, now }),
    ).toBe("password-required");
    expect(
      evaluateAlbumAccess(
        { ...album, visibility: AlbumVisibility.PRIVATE },
        { userId: null, secret, now },
      ),
    ).toBe("private");
    expect(
      evaluateAlbumAccess(
        { ...album, expiresAt: new Date(now.getTime() - 1) },
        { userId: null, secret, now },
      ),
    ).toBe("expired");
    expect(
      evaluateAlbumAccess(
        { ...album, visibility: AlbumVisibility.PRIVATE, expiresAt: new Date(0) },
        { userId: "clerk-owner", secret, now },
      ),
    ).toBe("allowed");
  });
});

describe("album password hashing", () => {
  it("hashes new passwords with bcrypt and verifies them", async () => {
    const passwordHash = await hashAlbumPassword("correct horse battery staple");
    expect(passwordHash).toMatch(/^\$2[aby]\$/);
    await expect(
      verifyAlbumPassword("correct horse battery staple", passwordHash),
    ).resolves.toEqual({ valid: true, needsUpgrade: false });
    await expect(
      verifyAlbumPassword("wrong password", passwordHash),
    ).resolves.toEqual({ valid: false, needsUpgrade: false });
  });

  it("verifies and marks legacy SHA-256 hashes for upgrade", async () => {
    const legacyHash = createHash("sha256")
      .update("old album password")
      .digest("hex");
    await expect(
      verifyAlbumPassword("old album password", legacyHash),
    ).resolves.toEqual({ valid: true, needsUpgrade: true });
    await expect(
      verifyAlbumPassword("incorrect", legacyHash),
    ).resolves.toEqual({ valid: false, needsUpgrade: false });
  });
});
