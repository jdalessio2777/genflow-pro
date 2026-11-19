// Run 14 (A): an added generator's own service address, on the customer
// screen, editable in place. Blank = the customer's address. Jobs copy it when
// they're booked (jobs.service_address), so editing it here never moves a job
// that already exists.
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { MapPin, Pencil, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { db } from "@/lib/db";
import { generatorPatch } from "@/lib/generatorInfo";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export default function GeneratorAddress({ customer, gen }) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(gen.address || "");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (saving) return;
    setSaving(true);
    try {
      // Patch the freshest row so another generator's edits aren't lost.
      const fresh = (await db.Customer.filter({ id: customer.id }))[0] || customer;
      await db.Customer.update(customer.id, generatorPatch(fresh, gen.id, { address: value.trim() }));
      queryClient.invalidateQueries({ queryKey: ["customer", customer.id] });
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      toast.success("Service address saved");
      setEditing(false);
    } catch (e) {
      toast.error(`Service address NOT saved: ${e.message}`);
    } finally {
      setSaving(false);
    }
  };

  if (editing) {
    return (
      <div className="mt-2 space-y-2" data-testid={`generator-address-edit-${gen.id}`}>
        <Input value={value} onChange={e => setValue(e.target.value)} placeholder="Blank = customer's address" className="rounded-xl" aria-label="Service address" autoFocus />
        <div className="flex gap-2">
          <Button type="button" size="sm" className="rounded-xl flex-1" onClick={save} disabled={saving}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save address"}
          </Button>
          <Button type="button" size="sm" variant="outline" className="rounded-xl flex-1" disabled={saving}
            onClick={() => { setValue(gen.address || ""); setEditing(false); }}>Cancel</Button>
        </div>
        <p className="text-xs text-muted-foreground">New jobs for this generator use it. Jobs already booked keep their address.</p>
      </div>
    );
  }

  return (
    <div className="mt-2 flex items-start justify-between gap-2" data-testid={`generator-address-${gen.id}`}>
      {gen.address ? (
        <a href={`https://maps.google.com/?q=${encodeURIComponent(gen.address)}`} target="_blank" rel="noopener noreferrer" className="flex items-start gap-1.5 min-w-0 text-sm text-primary">
          <MapPin className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          <span><span className="text-muted-foreground">Service address:</span> {gen.address}</span>
        </a>
      ) : (
        <p className="text-sm"><span className="text-muted-foreground">Service address:</span> same as customer</p>
      )}
      <button type="button" className="min-h-11 min-w-11 -my-3 flex items-center justify-center text-muted-foreground shrink-0"
        aria-label={`Edit service address for ${gen.label}`} onClick={() => { setValue(gen.address || ""); setEditing(true); }}>
        <Pencil className="w-4 h-4" />
      </button>
    </div>
  );
}
