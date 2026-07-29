import { useState } from "react";
import { compressImage } from "@/lib/compressImage";
import { integrationsCore } from "@/lib/coreIntegrations";
import { toast } from "sonner";

// Shared logic for every "Camera" / "Gallery" file input in the app:
// compress -> upload -> callback, with consistent error handling and
// input reset (a cleared input is required for onChange to refire if the
// same file is picked again after a failed attempt).
export function usePhotoUpload(baseConfig = {}) {
  const [uploading, setUploading] = useState(false);

  const handleFileChange = async (e, callConfig = {}) => {
    const config = { ...baseConfig, ...callConfig };
    const file = e.target.files[0];
    e.target.value = "";
    if (!file) return;

    config.onSelected?.(file);
    setUploading(true);
    try {
      const compressed = await compressImage(file);
      const { file_url } = await integrationsCore.UploadFile({ file: compressed });
      await config.onUploaded?.(file_url, file);
      if (config.successMessage) toast.success(config.successMessage);
    } catch (err) {
      if (config.onError) config.onError(err);
      else toast.error(config.errorMessage ? `${config.errorMessage}: ${err.message}` : (err.message || "Photo upload failed"));
    } finally {
      setUploading(false);
    }
  };

  return { uploading, handleFileChange };
}
