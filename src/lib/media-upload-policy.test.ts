import { describe, expect, it } from "vitest";

import {
  getTrustedUploadFields,
  getUploadExtension,
  validateUploadSize,
} from "@/lib/media-upload-policy";

describe("media upload policy", () => {
  it("rejects unsupported and oversized uploads", () => {
    expect(validateUploadSize("application/pdf", 100)).toBe(false);
    expect(validateUploadSize("image/jpeg", 200_000_001)).toBe(false);
    expect(validateUploadSize("video/mp4", 2_000_000_001)).toBe(false);
    expect(validateUploadSize("image/jpeg", 0)).toBe(false);
    expect(validateUploadSize("image/jpeg", 200_000_000)).toBe(true);
    expect(validateUploadSize("video/mp4", 2_000_000_000)).toBe(true);
  });

  it("chooses trusted folder, private setting, and unique safe extension", () => {
    const fields = getTrustedUploadFields(
      "album_123",
      "server-generated.jpg",
    );
    expect(fields.folder).toBe("/albums/album_123");
    expect(fields.isPrivateFile).toBe("true");
    expect(fields.useUniqueFileName).toBe("true");
    expect(getUploadExtension("image/jpeg")).toBe(".jpg");
    expect("folder" in fields).toBe(true);
  });
});
