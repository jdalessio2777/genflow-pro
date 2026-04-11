import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Camera, Trash2, ImagePlus } from "lucide-react";
import { toast } from "sonner";

const PHOTO_TYPES = ["before", "after", "issue", "general"];

export default function JobPhotosTab({ jobId, photos, isClosed }) {
  const queryClient = useQueryClient();
  const [uploading, setUploading] = useState(false);
  const [photoType, setPhotoType] = useState("before");

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.JobPhoto.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["job-photos", jobId] });
      toast.success("Photo removed");
    },
  });

  const handleUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      await base44.entities.JobPhoto.create({
        job_id: jobId,
        url: file_url,
        type: photoType,
        captured_at: new Date().toISOString(),
      });
      queryClient.invalidateQueries({ queryKey: ["job-photos", jobId] });
      toast.success(`${photoType.charAt(0).toUpperCase() + photoType.slice(1)} photo added`);
    } catch {
      toast.error("Upload failed");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  const groups = [
    { key: "before", label: "Before" },
    { key: "after", label: "After" },
    { key: "issue", label: "Issue" },
    { key: "general", label: "General" },
  ];

  return (
    <div className="space-y-4">
      {!isClosed && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Select value={photoType} onValueChange={setPhotoType}>
              <SelectTrigger className="rounded-xl flex-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PHOTO_TYPES.map(t => (
                  <SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-2 mt-3">
            {/* Camera — opens device camera directly */}
            <label className={`flex items-center justify-center gap-1.5 h-11 rounded-xl border border-input bg-background text-sm font-medium cursor-pointer select-none ${uploading ? "opacity-50 pointer-events-none" : ""}`}>
              <Camera className="w-4 h-4" />
              {uploading ? "Uploading..." : "Camera"}
              <input type="file" accept="image/*" capture="environment" onChange={handleUpload} className="hidden" />
            </label>
            {/* Gallery — opens photo library */}
            <label className={`flex items-center justify-center gap-1.5 h-11 rounded-xl border border-input bg-background text-sm font-medium cursor-pointer select-none ${uploading ? "opacity-50 pointer-events-none" : ""}`}>
              <ImagePlus className="w-4 h-4" />
              Gallery
              <input type="file" accept="image/*" onChange={handleUpload} className="hidden" />
            </label>
          </div>
        </div>
      )}

      {photos.length === 0 ? (
        <Card className="p-8 text-center">
          <Camera className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
          <p className="text-sm font-medium">No photos yet</p>
          <p className="text-xs text-muted-foreground mt-1">Capture before &amp; after photos for your records</p>
        </Card>
      ) : (
        <div className="space-y-4">
          {groups.map(group => {
            const items = photos.filter(p => p.type === group.key);
            if (items.length === 0) return null;
            return (
              <div key={group.key}>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                  {group.label} ({items.length})
                </p>
                <div className="grid grid-cols-3 gap-2">
                  {items.map(photo => (
                    <div key={photo.id} className="relative group aspect-square rounded-xl overflow-hidden bg-muted">
                      <img src={photo.url} alt={photo.type} className="w-full h-full object-cover" />
                      {!isClosed && (
                        <button
                          onClick={() => {
                            if (window.confirm("Remove this photo?")) deleteMutation.mutate(photo.id);
                          }}
                          className="absolute top-1.5 right-1.5 w-7 h-7 bg-black/60 rounded-lg flex items-center justify-center opacity-0 group-hover:opacity-100 active:opacity-100 transition-opacity"
                        >
                          <Trash2 className="w-3.5 h-3.5 text-white" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}