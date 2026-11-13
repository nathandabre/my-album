"use client";

import { useState } from "react";

import { buttonVariants } from "@/components/ui/button";
import { uploadImageToImageKit } from "@/lib/imagekit";
import { cn } from "@/lib/utils";

type UploadedImage = {
  url: string;
  fileId: string;
  filePath: string;
  name: string;
  width?: number;
  height?: number;
};

type ImageUploaderProps = {
  albumId: string;
  onUploaded?: (files: UploadedImage[]) => void;
};

export function ImageUploader({
  albumId,
  onUploaded,
}: ImageUploaderProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  async function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    if (files.length === 0) return;

    setIsUploading(true);
    setError(null);
    setProgress(0);

    try {
      const uploaded: UploadedImage[] = [];

      for (const [index, file] of files.entries()) {
        const result = await uploadImageToImageKit(file, albumId, {
          onProgress: (fileProgress) => {
            const overall = Math.round(
              ((index + fileProgress / 100) / files.length) * 100,
            );
            setProgress(overall);
          },
        });

        uploaded.push({
          url: result.url ?? "",
          fileId: result.fileId ?? "",
          filePath: result.filePath ?? "",
          name: result.name ?? file.name,
          width: result.width,
          height: result.height,
        });
      }

      onUploaded?.(uploaded);
      setProgress(100);
    } catch (uploadError) {
      setError(
        uploadError instanceof Error
          ? uploadError.message
          : "Upload failed. Please try again.",
      );
    } finally {
      setIsUploading(false);
      event.target.value = "";
    }
  }

  return (
    <div className="space-y-3">
      <label
        className={cn(
          buttonVariants(),
          isUploading && "pointer-events-none opacity-50",
        )}
      >
        <input
          type="file"
          accept="image/*"
          multiple
          className="sr-only"
          disabled={isUploading}
          onChange={handleChange}
        />
        {isUploading ? `Uploading… ${progress}%` : "Upload photos"}
      </label>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}
