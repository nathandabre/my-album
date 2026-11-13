import { describe, expect, it } from "vitest";

import { getAlbumPasswordAttemptKey } from "@/lib/password-attempt-key";

describe("password attempt bucket identity", () => {
  it("uses one account-level bucket regardless of forwarded IP values", () => {
    const secret = "test-only-signing-secret";
    const albumId = "album-with-protected-password";
    const requests = [
      { "x-forwarded-for": "203.0.113.1" },
      { "x-forwarded-for": "198.51.100.9, 10.0.0.3" },
      { "x-real-ip": "192.0.2.44" },
      {},
    ];
    const keys = requests.map(() => getAlbumPasswordAttemptKey(albumId, secret));
    expect(new Set(keys).size).toBe(1);
  });

  it("separates albums and signing secrets", () => {
    const key = getAlbumPasswordAttemptKey("album-a", "secret-a");
    expect(getAlbumPasswordAttemptKey("album-b", "secret-a")).not.toBe(key);
    expect(getAlbumPasswordAttemptKey("album-a", "secret-b")).not.toBe(key);
  });
});
