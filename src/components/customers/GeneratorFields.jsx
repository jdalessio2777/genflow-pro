import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import DateField from "@/components/ui/DateField";
import { GENERATOR_BRANDS, COOLING_OPTIONS, normalizeBrand, normalizeCooling, dateOnly } from "@/lib/generatorInfo";

/**
 * Brand, kW, Model #, Serial #, Install date, Cooling (Run 12, A3). `value` holds
 * { brand, kw, model, serial, install_date, cooling }; onChange(key, value).
 */
export default function GeneratorFields({ value, onChange, testPrefix = "gen" }) {
  const brand = normalizeBrand(value.brand);
  // A brand that isn't on the list (old data) still shows and stays selected.
  const brands = brand && !GENERATOR_BRANDS.includes(brand) ? [brand, ...GENERATOR_BRANDS] : GENERATOR_BRANDS;
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,1fr)] gap-2">
        <div className="min-w-0">
          <Label className="text-xs">Brand</Label>
          <Select value={brand} onValueChange={v => onChange("brand", v)}>
            <SelectTrigger className="rounded-xl mt-1" data-testid={`${testPrefix}-brand`}><SelectValue placeholder="Select brand..." /></SelectTrigger>
            <SelectContent>
              {brands.map(b => <SelectItem key={b} value={b}>{b}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="min-w-0">
          <Label className="text-xs">kW</Label>
          <Input value={value.kw ?? ""} onChange={e => onChange("kw", e.target.value)} type="number" min="0" step="any" data-testid={`${testPrefix}-kw`} className="rounded-xl mt-1" />
        </div>
      </div>
      <div>
        <Label className="text-xs">Model #</Label>
        <Input value={value.model ?? ""} onChange={e => onChange("model", e.target.value)} data-testid={`${testPrefix}-model`} className="rounded-xl mt-1" />
      </div>
      <div>
        <Label className="text-xs">Serial #</Label>
        <Input value={value.serial ?? ""} onChange={e => onChange("serial", e.target.value)} data-testid={`${testPrefix}-serial`} className="rounded-xl mt-1" />
      </div>
      <div>
        <Label className="text-xs">Install Date</Label>
        <DateField value={dateOnly(value.install_date)} onChange={v => onChange("install_date", v)} clearable data-testid={`${testPrefix}-install`} className="rounded-xl mt-1" />
      </div>
      <div>
        <Label className="text-xs">Cooling</Label>
        <Select value={normalizeCooling(value.cooling)} onValueChange={v => onChange("cooling", v)}>
          <SelectTrigger className="rounded-xl mt-1" data-testid={`${testPrefix}-cooling`}><SelectValue placeholder="Select cooling..." /></SelectTrigger>
          <SelectContent>
            {COOLING_OPTIONS.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
