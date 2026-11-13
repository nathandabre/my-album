import { describe, expect, it } from "vitest";

import { detectMediaType } from "@/lib/media-validation";

describe("media content detection", () => {
  it.each([
    [Buffer.from([0xff, 0xd8, 0xff, 0x00]), "image/jpeg"],
    [
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      "image/png",
    ],
    [Buffer.from("GIF89a"), "image/gif"],
    [Buffer.from("RIFF0000WEBP"), "image/webp"],
    [Buffer.from("0000ftypavif"), "image/avif"],
    [Buffer.from("0000ftypqt  "), "video/quicktime"],
    [
      Buffer.concat([
        Buffer.from([0, 0, 0, 24]),
        Buffer.from("ftypisom"),
        Buffer.alloc(4),
        Buffer.from("isommp42"),
      ]),
      "video/mp4",
    ],
    [Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x00]), "video/webm"],
  ])("recognizes %s using file content", (content, expected) => {
    expect(detectMediaType(content)).toBe(expected);
  });

  it("rejects content with no supported media signature", () => {
    expect(detectMediaType(Buffer.from("<script>alert(1)</script>"))).toBeNull();
    expect(detectMediaType(Buffer.from("0000ftypheic"))).toBeNull();
  });
});
