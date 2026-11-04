import { Label } from "@/components/ui/label";
import DateField from "@/components/ui/DateField";
import { WINDOW_PRESETS, MODE_CUSTOM, MODE_EXACT } from "@/lib/arrivalWindow";

const CHIP = "min-h-11 rounded-xl border px-2 text-sm font-medium transition-colors";
const chipClass = (on) => `${CHIP} ${on ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground"}`;

/**
 * Date + arrival window (Run 12, A2). `value` is { date, mode, start, end };
 * the caller turns it into scheduled_date + arrival_window_end with
 * appointmentFromPicker when it saves. Windows are the default; "Exact time"
 * stays for emergencies. `clearable` lets the date be taken off (not scheduled).
 */
export default function ArrivalWindowPicker({ value, onChange, clearable = false, idPrefix = "arrival" }) {
  const set = (patch) => onChange({ ...value, ...patch });
  const pickPreset = (p) => set({ mode: p.key, start: p.start, end: p.end });
  return (
    <div className="space-y-3 min-w-0" data-testid="arrival-window-picker">
      <div>
        <Label className="text-xs" htmlFor={`${idPrefix}-date`}>Date</Label>
        <DateField id={`${idPrefix}-date`} data-testid="arrival-date" value={value.date} clearable={clearable}
          onChange={(date) => set({ date })} className="rounded-xl mt-1" />
      </div>
      <div>
        <Label className="text-xs">Arrival window</Label>
        <div className="grid grid-cols-2 gap-2 mt-1">
          {WINDOW_PRESETS.map((p) => (
            <button key={p.key} type="button" aria-pressed={value.mode === p.key} data-testid={`window-${p.key}`}
              className={chipClass(value.mode === p.key)} onClick={() => pickPreset(p)}>{p.label}</button>
          ))}
          <button type="button" aria-pressed={value.mode === MODE_CUSTOM} data-testid="window-custom"
            className={chipClass(value.mode === MODE_CUSTOM)} onClick={() => set({ mode: MODE_CUSTOM })}>Custom window</button>
          <button type="button" aria-pressed={value.mode === MODE_EXACT} data-testid="window-exact"
            className={`${chipClass(value.mode === MODE_EXACT)} col-span-2`} onClick={() => set({ mode: MODE_EXACT })}>Exact time (emergencies)</button>
        </div>
      </div>
      {value.mode === MODE_CUSTOM && (
        <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-2 form-row">
          <div className="min-w-0">
            <Label className="text-xs" htmlFor={`${idPrefix}-start`}>Window starts</Label>
            <DateField id={`${idPrefix}-start`} data-testid="window-start" type="time" value={value.start} onChange={(start) => set({ start })} className="rounded-xl mt-1" />
          </div>
          <div className="min-w-0">
            <Label className="text-xs" htmlFor={`${idPrefix}-end`}>Window ends</Label>
            <DateField id={`${idPrefix}-end`} data-testid="window-end" type="time" value={value.end} onChange={(end) => set({ end })} className="rounded-xl mt-1" />
          </div>
        </div>
      )}
      {value.mode === MODE_EXACT && (
        <div>
          <Label className="text-xs" htmlFor={`${idPrefix}-exact`}>Exact time</Label>
          <DateField id={`${idPrefix}-exact`} data-testid="window-exact-time" type="time" value={value.start} onChange={(start) => set({ start })} className="rounded-xl mt-1" />
        </div>
      )}
    </div>
  );
}
