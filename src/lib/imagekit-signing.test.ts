import { describe, expect, it } from "vitest";

import { buildSignedImageKitUrl } from "@/lib/imagekit-signing";

describe("ImageKit signed media URLs", () => {
  it("creates a short-lived URL for a private file and safe transformation", () => {
    const url = buildSignedImageKitUrl({
      privateKey: "test-private-key",
      endpoint: "https://ik.imagekit.io/test-account",
      filePath: "/albums/album-1/photo.jpg",
      transformations: "w-800,q-80",
      expiresIn: 60,
    });

    const expiresAt = Number(url.searchParams.get("ik-t"));
    const now = Math.floor(Date.now() / 1000);
    expect(url.origin).toBe("https://ik.imagekit.io");
    expect(url.pathname).toContain("/test-account/tr:w-800,q-80/albums/album-1/photo.jpg");
    expect(url.searchParams.get("ik-s")).toBeTruthy();
    expect(expiresAt).toBeGreaterThan(now);
    expect(expiresAt).toBeLessThanOrEqual(now + 60);
  });

  it("rejects unsafe paths, endpoints and lifetimes", () => {
    expect(() =>
      buildSignedImageKitUrl({
        privateKey: "test-private-key",
        endpoint: "https://ik.imagekit.io/test-account",
        filePath: "https://attacker.example/file",
        expiresIn: 60,
      }),
    ).toThrow("ImageKit signed URL options are invalid");
    expect(() =>
      buildSignedImageKitUrl({
        privateKey: "test-private-key",
        endpoint: "http://ik.imagekit.io/test-account",
        filePath: "/albums/album-1/photo.jpg",
        expiresIn: 60,
      }),
    ).toThrow("ImageKit signed URL options are invalid");
    expect(() =>
      buildSignedImageKitUrl({
        privateKey: "test-private-key",
        endpoint: "https://ik.imagekit.io/test-account",
        filePath: "/albums/album-1/../secret.jpg",
        expiresIn: 60,
      }),
    ).toThrow("ImageKit signed URL options are invalid");
  });
});
