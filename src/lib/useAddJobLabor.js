import { useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { db } from "@/lib/db";
import { haptics } from "@/lib/haptics";
import { createOnce, newRequestId, showSaveError, dismissSaveError, useSaveGuard } from "@/lib/saveSafety";

// Adds a job_labor line with weak-signal safety (H-2): one add at a time,
// "added" only after the server saved it, persistent error + Retry, and a
// fixed id per line so a Retry after a lost response can't add it twice.
export function useAddJobLabor(jobId, { onAdded } = {}) {
  const queryClient = useQueryClient();
  const guard = useSaveGuard();
  const pending = useRef(null); // { key, id }

  const add = (line, label = line.description) => guard.run(async function attempt() {
    const key = JSON.stringify(line);
    if (!pending.current || pending.current.key !== key) pending.current = { key, id: newRequestId() };
    try {
      const row = await createOnce(db.JobLabor, pending.current.id, line);
      pending.current = null;
      dismissSaveError("", { id: "add-labor-error" });
      queryClient.invalidateQueries({ queryKey: ["job-labor", jobId] });
      toast.success(`${label} added`);
      onAdded?.(row, line);
      return row;
    } catch (e) {
      haptics.error();
      showSaveError(`"${label}" NOT added`, e, () => guard.run(attempt), { id: "add-labor-error" });
      return null;
    }
  });

  return { add, busy: guard.busy };
}
