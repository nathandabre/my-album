import { describe, expect, it } from "vitest";

import {
  appendUniquePhotos,
  decodeGalleryCursor,
  encodeGalleryCursor,
} from "@/lib/gallery-pagination";

describe("gallery pagination cursor", () => {
  it("encodes and parses deterministic order cursors", () => {
    const cursor = encodeGalleryCursor({ id: "photo_1", sortOrder: 12 });
    expect(decodeGalleryCursor(cursor)).toEqual({
      id: "photo_1",
      sortOrder: 12,
    });
  });

  it("rejects malformed or out-of-range cursors", () => {
    expect(decodeGalleryCursor("not-a-cursor")).toBeNull();
    expect(decodeGalleryCursor("999999999999999999:photo_1")).toBeNull();
    expect(decodeGalleryCursor("1:bad/photo")).toBeNull();
  });

  it("deduplicates appended pages without changing the existing order", () => {
    expect(
      appendUniquePhotos(
        [{ id: "first" }, { id: "second" }],
        [{ id: "second" }, { id: "third" }, { id: "third" }],
      ),
    ).toEqual([{ id: "first" }, { id: "second" }, { id: "third" }]);
  });
});
