import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentDbUser: vi.fn(),
  albumFindFirst: vi.fn(),
  reserveMediaUpload: vi.fn(),
  releaseMediaUploadReservation: vi.fn(),
  adjustMediaUploadReservation: vi.fn(),
  enqueueUnlinkedMediaCleanup: vi.fn(),
  verifyImageKitUpload: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  getCurrentDbUser: mocks.getCurrentDbUser,
}));
vi.mock("@/lib/db", () => ({
  prisma: { album: { findFirst: mocks.albumFindFirst } },
}));
vi.mock("@/lib/media-upload-quota", () => ({
  reserveMediaUpload: mocks.reserveMediaUpload,
  releaseMediaUploadReservation: mocks.releaseMediaUploadReservation,
  adjustMediaUploadReservation: mocks.adjustMediaUploadReservation,
}));
vi.mock("@/lib/media-cleanup", () => ({
  enqueueUnlinkedMediaCleanup: mocks.enqueueUnlinkedMediaCleanup,
}));
vi.mock("@/lib/imagekit-server", () => ({
  verifyImageKitUpload: mocks.verifyImageKitUpload,
}));

import { POST } from "@/app/api/albums/[album]/upload/route";

function requestWithForm(form: FormData) {
  return new Request("https://album.test/api/albums/album-a/upload", {
    method: "POST",
    headers: {
      origin: "https://album.test",
      "content-length": "4096",
    },
    body: form,
  });
}

describe("private ImageKit upload route", () => {
  beforeEach(() => {
    vi.stubEnv("IMAGEKIT_PRIVATE_KEY", "test-private-key");
    mocks.getCurrentDbUser.mockResolvedValue({ id: "owner-a" });
    mocks.albumFindFirst.mockResolvedValue({ id: "album-a" });
    mocks.reserveMediaUpload.mockResolvedValue(true);
    mocks.releaseMediaUploadReservation.mockResolvedValue(undefined);
    mocks.adjustMediaUploadReservation.mockResolvedValue(undefined);
    mocks.enqueueUnlinkedMediaCleanup.mockResolvedValue(undefined);
    mocks.verifyImageKitUpload.mockResolvedValue({
      fileId: "imagekit-file",
      filePath: "/albums/album-a/server-name.jpg",
      fileName: "server-name.jpg",
      mimeType: "image/jpeg",
      width: 10,
      height: 10,
      sizeBytes: 3,
      isPrivate: true,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it("rejects unauthenticated callers before creating upload credentials", async () => {
    mocks.getCurrentDbUser.mockResolvedValue(null);
    const response = await POST(requestWithForm(new FormData()), {
      params: Promise.resolve({ album: "album-a" }),
    });
    expect(response.status).toBe(401);
    expect(mocks.albumFindFirst).not.toHaveBeenCalled();
    expect(mocks.reserveMediaUpload).not.toHaveBeenCalled();
  });

  it("rejects uploads into albums not owned by the caller", async () => {
    mocks.albumFindFirst.mockResolvedValue(null);
    const response = await POST(requestWithForm(new FormData()), {
      params: Promise.resolve({ album: "album-b" }),
    });
    expect(response.status).toBe(404);
    expect(mocks.reserveMediaUpload).not.toHaveBeenCalled();
  });

  it("rejects requests exceeding the maximum media request size", async () => {
    const request = new Request("https://album.test/api/albums/album-a/upload", {
      method: "POST",
      headers: {
        origin: "https://album.test",
        "content-type": "multipart/form-data; boundary=example",
        "content-length": "2000016385",
      },
      body: "too large",
    });
    const response = await POST(request, {
      params: Promise.resolve({ album: "album-a" }),
    });
    expect(response.status).toBe(400);
    expect(mocks.reserveMediaUpload).not.toHaveBeenCalled();
  });

  it("streams only a valid image with server-selected private album fields", async () => {
    const form = new FormData();
    form.append("file", new Blob([new Uint8Array([0xff, 0xd8, 0xff])], {
      type: "image/jpeg",
    }), "attacker-name.jpg");
    let forwardedBody = "";
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        const reader = (init?.body as ReadableStream<Uint8Array>).getReader();
        const decoder = new TextDecoder();
        while (true) {
          const part = await reader.read();
          if (part.done) break;
          forwardedBody += decoder.decode(part.value, { stream: true });
        }
        return Response.json({ fileId: "imagekit-file" });
      }),
    );

    const response = await POST(requestWithForm(form), {
      params: Promise.resolve({ album: "album-a" }),
    });
    expect(response.status).toBe(200);
    expect(forwardedBody).toContain("folder");
    expect(forwardedBody).toContain("/albums/album-a");
    expect(forwardedBody).toContain("isPrivateFile");
    expect(forwardedBody).toContain("\r\n\r\ntrue\r\n");
    expect(forwardedBody).not.toContain("attacker-name.jpg");
    expect(mocks.verifyImageKitUpload).toHaveBeenCalledWith(
      "album-a",
      "imagekit-file",
      "image/jpeg",
    );
  });

  it("rejects caller-supplied folder fields and queues any uploaded orphan", async () => {
    const form = new FormData();
    form.append("file", new Blob([new Uint8Array([0xff, 0xd8, 0xff])], {
      type: "image/jpeg",
    }), "photo.jpg");
    form.append("folder", "/another-album");
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        const reader = (init?.body as ReadableStream<Uint8Array>).getReader();
        while (!(await reader.read()).done) {
          // Consume the rejected upload stream so the provider response can finish.
        }
        return Response.json({ fileId: "imagekit-file" });
      }),
    );

    const response = await POST(requestWithForm(form), {
      params: Promise.resolve({ album: "album-a" }),
    });
    expect(response.status).toBe(400);
    expect(mocks.enqueueUnlinkedMediaCleanup).toHaveBeenCalledWith(
      "album-a",
      ["imagekit-file"],
    );
  });

  it("rejects invalid file signatures before contacting ImageKit", async () => {
    const form = new FormData();
    form.append("file", new Blob(["not an image"], { type: "image/jpeg" }), "fake.jpg");
    const imageKitFetch = vi.fn();
    vi.stubGlobal("fetch", imageKitFetch);

    const response = await POST(requestWithForm(form), {
      params: Promise.resolve({ album: "album-a" }),
    });
    expect(response.status).toBe(400);
    expect(imageKitFetch).not.toHaveBeenCalled();
  });
});
