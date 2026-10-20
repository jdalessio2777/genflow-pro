import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ESTIMATE_QUICK_PICKS, DEFAULT_ESTIMATE_MINUTES, minutesFromHoursInput } from "@/lib/jobDuration";

// "Estimated time on site" (B2): quick picks + a custom value in hours.
// value/onChange are minutes.
export default function EstimatedLengthPicker({ value, onChange, className = "" }) {
  const minutes = Number(value) > 0 ? Number(value) : DEFAULT_ESTIMATE_MINUTES;
  const isPick = ESTIMATE_QUICK_PICKS.some(p => p.minutes === minutes);
  const [customOpen, setCustomOpen] = useState(!isPick);
  const [customText, setCustomText] = useState(isPick ? "" : String(Math.round((minutes / 60) * 100) / 100));

  const chip = (active) =>
    `h-10 rounded-xl border text-sm font-medium transition-colors ${active ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground active:bg-muted/50"}`;

  return (
    <div className={className} data-testid="estimate-picker">
      <Label className="text-xs">Estimated time on site</Label>
      <div className="grid grid-cols-4 gap-2 mt-1">
        {ESTIMATE_QUICK_PICKS.map(p => (
          <button key={p.minutes} type="button" aria-pressed={!customOpen && minutes === p.minutes}
            className={chip(!customOpen && minutes === p.minutes)}
            onClick={() => { setCustomOpen(false); onChange(p.minutes); }}>
            {p.label}
          </button>
        ))}
        <button type="button" aria-pressed={customOpen} className={`${chip(customOpen)} col-span-2`}
          onClick={() => setCustomOpen(true)}>
          Custom
        </button>
      </div>
      {customOpen && (
        <div className="flex items-center gap-2 mt-2">
          <Input
            type="number" inputMode="decimal" step="0.25" min="0.25" max="24"
            aria-label="Custom hours"
            value={customText}
            onChange={e => {
              setCustomText(e.target.value);
              const m = minutesFromHoursInput(e.target.value);
              if (m) onChange(m);
            }}
            className="rounded-xl w-28"
            placeholder="e.g. 2.5"
          />
          <span className="text-sm text-muted-foreground">hours</span>
        </div>
      )}
    </div>
  );
}
