import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

/**
 * Every date / time input in the app (Run 12, A1).
 *
 * iOS's picker has a Reset button, and a stray tap there sends the form an empty
 * value. Here an empty value from the input is ignored: the field keeps what it
 * had, so only actually picking a new date changes it. Clearing a saved date is
 * a separate step: Clear, then confirm (only when `clearable`).
 */
export default function DateField({ value, onChange, type = "date", clearable = false, className, wrapperClassName, ...props }) {
  const [confirming, setConfirming] = useState(false);
  const shown = value ?? "";
  return (
    <div className={wrapperClassName}>
      <Input
        {...props}
        type={type}
        value={shown}
        className={className}
        onChange={(e) => {
          const next = e.target.value;
          if (!next) {
            // Put it back right away: React only re-syncs when state changes.
            e.target.value = shown;
            return;
          }
          setConfirming(false);
          onChange(next);
        }}
      />
      {clearable && shown && !confirming && (
        <button type="button" data-testid="date-clear" onClick={() => setConfirming(true)}
          className="mt-1 min-h-11 px-1 text-xs font-medium text-muted-foreground underline underline-offset-2">
          Clear
        </button>
      )}
      {clearable && shown && confirming && (
        <div className="mt-1 flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Clear this date?</span>
          <Button type="button" size="sm" variant="outline" className="rounded-xl min-h-11" data-testid="date-clear-yes"
            onClick={() => { setConfirming(false); onChange(""); }}>Clear</Button>
          <Button type="button" size="sm" variant="ghost" className="rounded-xl min-h-11" data-testid="date-clear-no"
            onClick={() => setConfirming(false)}>Keep</Button>
        </div>
      )}
    </div>
  );
}
