"use client";

import { CoverPicker } from "./cover-picker";
import { PhotoGrid } from "./photo-grid";
import { UploadPanel } from "./upload-panel";
import type { AlbumDetail } from "./types";
import { useAlbumUploads } from "./use-album-uploads";

export function PhotosPanel({ album }: { album: AlbumDetail }) {
  const uploads = useAlbumUploads(album.id);

  return (
    <div className="space-y-6">
      <UploadPanel
        isUploading={uploads.isUploading}
        uploadProgress={uploads.uploadProgress}
        uploadStatusText={uploads.uploadStatusText}
        uploadError={uploads.uploadError}
        onFilesUpload={uploads.handleFilesUpload}
      />
      <CoverPicker album={album} />
      <PhotoGrid album={album} setUploadError={uploads.setUploadError} />
    </div>
  );
}
