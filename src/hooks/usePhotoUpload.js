import { useState } from "react";
import { compressImage } from "@/lib/compressImage";
import { integrationsCore } from "@/lib/coreIntegrations";
import { toast } from "sonner";
import { showSaveError, dismissSaveError } from "@/lib/saveSafety";

// Shared logic for every "Camera" / "Gallery" file input in the app:
// compress -> upload -> callback, with consistent error handling and
// input reset (a cleared input is required for onChange to refire if the
// same file is picked again after a failed attempt).
export function usePhotoUpload(baseConfig = {}) {
  const [uploading, setUploading] = useState(false);

  // compress -> upload -> onUploaded. On failure the picked photo is kept in
  // memory and the message (which stays until dismissed) offers Retry; a
  // Retry skips the upload if the file already reached storage, so only the
  // failed step runs again (H-2).
  const run = async (file, config, progress) => {
    setUploading(true);
    try {
      if (!progress.file_url) {
        const compressed = await compressImage(file);
        const { file_url } = await integrationsCore.UploadFile({ file: compressed });
        progress.file_url = file_url;
      }
      await config.onUploaded?.(progress.file_url, file);
      dismissSaveError("", { id: "photo-upload-error" });
      if (config.successMessage) toast.success(config.successMessage);
    } catch (err) {
      console.error('[photo-upload] Full error:', {
        message: err?.message,
        status: err?.status,
        statusCode: err?.statusCode,
        name: err?.name,
        error: err,
      });
      if (config.onError) config.onError(err);
      else showSaveError(config.errorMessage ? `${config.errorMessage} — photo NOT saved` : "Photo NOT saved", err,
        () => run(file, config, progress), { id: "photo-upload-error" });
    } finally {
      setUploading(false);
    }
  };

  const handleFileChange = async (e, callConfig = {}) => {
    const config = { ...baseConfig, ...callConfig };
    const file = e.target.files[0];
    e.target.value = "";
    if (!file) return;

    config.onSelected?.(file);
    await run(file, config, {});
  };

  return { uploading, handleFileChange };
}
