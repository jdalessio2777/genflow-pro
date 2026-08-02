import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// Shared by InvoiceDetail.jsx's manual-payment grid and Invoices.jsx's
// swipe-to-paid sheet — both mark an invoice paid by "check" and both need
// the same check-number capture before confirming.
export default function CheckNumberDialog({ open, onOpenChange, onConfirm }) {
  const [checkNumber, setCheckNumber] = useState("");

  useEffect(() => {
    if (open) setCheckNumber("");
  }, [open]);

  const handleConfirm = () => {
    onConfirm(checkNumber.trim());
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>Check Number</DialogTitle></DialogHeader>
        <div>
          <Label className="text-xs">Check # (optional)</Label>
          <Input
            value={checkNumber}
            onChange={e => setCheckNumber(e.target.value)}
            placeholder="e.g. 1234"
            inputMode="numeric"
            autoFocus
            className="mt-1"
            onKeyDown={e => { if (e.key === "Enter") handleConfirm(); }}
          />
        </div>
        <div className="flex gap-2 mt-2">
          <Button variant="outline" className="flex-1 rounded-xl" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button className="flex-1 rounded-xl" onClick={handleConfirm}>Confirm &amp; Mark Paid</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
