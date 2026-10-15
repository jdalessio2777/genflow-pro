import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PenLine, CheckCircle2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { haptics } from "@/lib/haptics";
import { showSaveError, dismissSaveError, useSaveGuard } from "@/lib/saveSafety";
import SignaturePad from "@/components/signature/SignaturePad";

// The ONE job signature control (Item 2). Placed directly above Collect
// Payment (or above Close / Complete on a $0 job) and in the Notes tab — every
// copy saves through the same onSave(dataUrl) -> Promise.
//   unsigned: "Collect Signature" -> full-screen pad
//   signed:   "Signed ✓" -> view it, or Redo
// "Signature saved" only after the server confirms; on failure the drawn
// signature is kept and Retry re-sends it (H-2).
export default function JobSignatureButton({ signature, onSave, disabled = false, className = "" }) {
  const [padOpen, setPadOpen] = useState(false);
  const [viewOpen, setViewOpen] = useState(false);
  const guard = useSaveGuard();

  const save = (sig) => guard.run(async function attempt() {
    try {
      await onSave(sig);
      haptics.success();
      dismissSaveError("", { id: "signature-error" });
      toast.success("Signature saved");
    } catch (e) {
      haptics.error();
      showSaveError("Signature NOT saved", e, () => guard.run(attempt), { id: "signature-error" });
    }
  });

  return (
    <>
      {signature ? (
        <Button type="button" variant="outline" disabled={disabled}
          className={`w-full rounded-xl h-11 gap-1.5 border-green-300 text-green-800 dark:border-green-700 dark:text-green-300 ${className}`}
          data-testid="signature-signed" onClick={() => setViewOpen(true)}>
          <CheckCircle2 className="w-4 h-4" /> Signed ✓
          <span className="text-xs font-normal text-muted-foreground ml-1">· tap to view / redo</span>
        </Button>
      ) : (
        <Button type="button" variant="outline" disabled={disabled || guard.busy}
          className={`w-full rounded-xl h-11 gap-1.5 ${className}`}
          data-testid="collect-signature" onClick={() => setPadOpen(true)}>
          {guard.busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <PenLine className="w-4 h-4" />} Collect Signature
        </Button>
      )}

      <Dialog open={viewOpen} onOpenChange={setViewOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Customer Signature</DialogTitle></DialogHeader>
          {signature && (
            <img src={signature} alt="Customer signature" className="w-full max-h-40 object-contain rounded-xl border border-border bg-white" />
          )}
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1 rounded-xl h-11" onClick={() => setViewOpen(false)}>Close</Button>
            <Button className="flex-1 rounded-xl h-11 gap-1.5" disabled={disabled || guard.busy}
              onClick={() => { setViewOpen(false); setPadOpen(true); }}>
              <PenLine className="w-4 h-4" /> Redo signature
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {padOpen && (
        <SignaturePad
          onCancel={() => setPadOpen(false)}
          onSave={(sig) => { setPadOpen(false); save(sig); }}
        />
      )}
    </>
  );
}
