"use client";

import { UploadCloud } from "lucide-react";

type UploadPanelProps = {
  isUploading: boolean;
  uploadProgress: number;
  uploadStatusText: string;
  uploadError: string | null;
  onFilesUpload: React.ChangeEventHandler<HTMLInputElement>;
};

export function UploadPanel({
  isUploading,
  uploadProgress,
  uploadStatusText,
  uploadError,
  onFilesUpload,
}: UploadPanelProps) {
  return (
    <div className="relative rounded-2xl border-2 border-dashed border-border bg-card/40 p-8 text-center transition-all hover:bg-card/70 hover:border-primary/50">
      <input
        type="file"
        accept="image/avif,image/gif,image/jpeg,image/png,image/webp,video/mp4,video/quicktime,video/webm"
        multiple
        disabled={isUploading}
        onChange={onFilesUpload}
        className="absolute inset-0 cursor-pointer opacity-0 disabled:cursor-not-allowed"
      />
      <div className="flex flex-col items-center justify-center">
        <div className="rounded-2xl bg-primary/10 p-3.5 text-primary mb-3">
          <UploadCloud className="h-8 w-8" />
        </div>
        <h3 className="text-base font-semibold text-foreground">
          {isUploading ? uploadStatusText : "Click or drag & drop photos and videos here"}
        </h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Supports JPG, PNG, WEBP, MP4, MOV, and WEBM. Videos up to 2 GB.
        </p>

        {isUploading && (
          <div className="mt-4 w-full max-w-xs space-y-1.5">
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full bg-primary transition-all duration-200"
                style={{ width: `${uploadProgress}%` }}
              />
            </div>
            <span className="text-xs font-medium text-muted-foreground">
              {uploadProgress}% completed
            </span>
          </div>
        )}

        {uploadError && (
          <p className="mt-3 text-xs text-destructive font-medium">
            {uploadError}
          </p>
        )}
      </div>
    </div>
  );
}
