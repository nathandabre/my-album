"use client";

import { useState, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";

import {
  addPhotosToAlbumAction,
  cleanupFailedImageKitUploadsAction,
} from "@/app/actions/photos";
import { uploadImageToImageKit } from "@/lib/imagekit";
import {
  MAX_IMAGE_BYTES,
  MAX_VIDEO_BYTES,
  supportedMediaTypeSchema,
} from "@/lib/media-upload-policy";

const MAX_PHOTOS_PER_UPLOAD = 100;

export function useAlbumUploads(albumId: string) {
  const router = useRouter();
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStatusText, setUploadStatusText] = useState("");
  const [uploadError, setUploadError] = useState<string | null>(null);

  async function handleFilesUpload(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    if (files.length === 0) return;

    if (files.length > MAX_PHOTOS_PER_UPLOAD) {
      setUploadError(`Upload no more than ${MAX_PHOTOS_PER_UPLOAD} photos at a time.`);
      event.target.value = "";
      return;
    }

    const invalidFile = files.find((file) => {
      const maxBytes = file.type.startsWith("video/")
        ? MAX_VIDEO_BYTES
        : MAX_IMAGE_BYTES;
      return (
        !supportedMediaTypeSchema.safeParse(file.type).success ||
        file.size <= 0 ||
        file.size > maxBytes
      );
    });
    if (invalidFile) {
      setUploadError(
        `${invalidFile.name} is not a supported image/video or exceeds its size limit (200 MB per image, 2 GB per video).`,
      );
      event.target.value = "";
      return;
    }

    setIsUploading(true);
    setUploadError(null);
    setUploadProgress(0);

    const uploadedPayloads = [];
    const uploadedFileIds: string[] = [];

    try {
      for (const [index, file] of files.entries()) {
        setUploadStatusText(`Uploading ${index + 1} of ${files.length} media files…`);

        const result = await uploadImageToImageKit(file, albumId, {
          onProgress: (percent) => {
            const overall = Math.round(
              ((index + percent / 100) / files.length) * 100,
            );
            setUploadProgress(overall);
          },
        });

        if (result.fileId) uploadedFileIds.push(result.fileId);
        if (!result.fileId || !result.filePath || result.isPrivateFile !== true) {
          throw new Error(`ImageKit did not return valid metadata for ${file.name}.`);
        }

        uploadedPayloads.push({
          imagekitFileId: result.fileId,
          caption: file.name.replace(/\.[^/.]+$/, ""),
          mimeType: file.type,
        });
      }

      setUploadStatusText("Saving media to album…");
      const result = await addPhotosToAlbumAction(albumId, uploadedPayloads);

      if (result.error) {
        const cleanup = await cleanupFailedImageKitUploadsAction(
          albumId,
          uploadedFileIds,
        );
        setUploadError(
          (typeof cleanup.cleanupPending === "number"
            ? cleanup.cleanupPending > 0
            : uploadedFileIds.length > 0)
            ? `${result.error} Storage cleanup is pending.`
            : result.error,
        );
      } else {
        router.refresh();
      }
    } catch (error) {
      let cleanupPending = 0;
      if (uploadedFileIds.length > 0) {
        try {
          const cleanup = await cleanupFailedImageKitUploadsAction(
            albumId,
            uploadedFileIds,
          );
          cleanupPending =
            typeof cleanup.cleanupPending === "number"
              ? cleanup.cleanupPending
              : uploadedFileIds.length;
        } catch {
          cleanupPending = uploadedFileIds.length;
        }
      }
      const message =
        error instanceof Error ? error.message : "Failed to upload media.";
      setUploadError(
        cleanupPending > 0
          ? `${message} Storage cleanup is pending for ${cleanupPending} file(s).`
          : message,
      );
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
      setUploadStatusText("");
      event.target.value = "";
    }
  }

  return {
    isUploading,
    uploadProgress,
    uploadStatusText,
    uploadError,
    setUploadError,
    handleFilesUpload,
  };
}
