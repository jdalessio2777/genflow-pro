import { useState } from "react";
import { getUserColor } from "@/lib/userColors";
import { TECHS } from "@/lib/jobTechs";

/**
 * Who's on the job (Run 12, A7). One tech by default: tapping a name switches to
 * that tech. "Add another tech" turns on picking more than one, so a shared job
 * is always a deliberate choice. The first name picked is the lead.
 */
export default function TechPicker({ value, onChange }) {
  const [many, setMany] = useState(false);
  const multi = many || value.length > 1;
  const tap = (name) => {
    if (!multi) { onChange([name]); return; }
    if (!value.includes(name)) { onChange([...value, name]); return; }
    if (value.length > 1) onChange(value.filter((n) => n !== name));
  };
  return (
    <div data-testid="tech-picker">
      <div className="grid grid-cols-4 gap-2 mt-1">
        {TECHS.map((name) => {
          const color = getUserColor(name);
          const on = value.includes(name);
          return (
            <button key={name} type="button" aria-pressed={on} data-testid={`tech-${name}`} onClick={() => tap(name)}
              className={`min-h-11 rounded-xl border text-sm font-medium transition-colors ${on ? `${color.border} ${color.bg} ${color.text}` : "border-border text-muted-foreground"}`}>
              {name}
            </button>
          );
        })}
      </div>
      {!multi && (
        <button type="button" data-testid="tech-add-another" onClick={() => setMany(true)}
          className="mt-1 min-h-11 px-1 text-xs font-medium text-muted-foreground underline underline-offset-2">
          Add another tech
        </button>
      )}
      {multi && <p className="text-xs text-muted-foreground mt-1">Tap each tech on this job.</p>}
    </div>
  );
}
