import { useMemo, useState } from "react";
import { ResponsiveContainer, ComposedChart, BarChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip } from "recharts";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatCurrency } from "@/lib/utils/format";
import { PRESETS, rangeFor, previousRange, computeFinance, computeSeries, change, todayET, addDays } from "@/lib/finance/core";

// Finance > Insights (Run 9, D2): an in-depth look at any date range, every
// number compared with the period just before. All numbers come from the
// shared finance module (lib/finance/core.js) — the same one Overview and the
// weekly report email use. Charts: recharts (already in the app), one y-axis
// each, thin marks, tap a bar/point for its values, a table under the main
// chart. Colors: the validated categorical slots 1-3 (index.css --viz-*).

const money0 = (n) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n || 0);
const moneyAxis = (n) => (Math.abs(n) >= 1000 ? `$${Math.round(n / 100) / 10}k` : `$${Math.round(n)}`);

function Delta({ cur, prev, goodWhenUp = true, testid }) {
  const d = change(cur, prev);
  if (d === null) return <span className="text-[11px] text-muted-foreground" data-testid={testid}>new vs prev.</span>;
  if (d === 0) return <span className="inline-flex items-center gap-0.5 text-[11px] text-muted-foreground" data-testid={testid}><Minus className="w-3 h-3" />0%</span>;
  const up = d > 0; const good = up === goodWhenUp;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={`inline-flex items-center gap-0.5 text-[11px] font-semibold ${good ? "text-green-700 dark:text-green-400" : "text-red-700 dark:text-red-400"}`} data-testid={testid}>
      <Icon className="w-3 h-3" aria-hidden="true" />{up ? "+" : ""}{d.toFixed(Math.abs(d) < 10 ? 1 : 0)}%
      <span className="sr-only">{up ? "up" : "down"} vs previous period</span>
    </span>
  );
}

function Kpi({ label, value, cur, prev, goodWhenUp, sub, id }) {
  return (
    <Card className="p-3 min-w-0" data-testid={`kpi-${id}`}>
      <p className="text-[11px] font-semibold text-muted-foreground truncate">{label}</p>
      <p className="text-lg font-bold text-foreground leading-tight truncate" data-testid={`kpi-${id}-value`}>{value}</p>
      <div className="flex items-center justify-between gap-1 mt-0.5">
        {prev !== undefined ? <Delta cur={cur} prev={prev} goodWhenUp={goodWhenUp} testid={`kpi-${id}-delta`} /> : <span />}
        {sub && <span className="text-[10px] text-muted-foreground truncate">{sub}</span>}
      </div>
    </Card>
  );
}

function Section({ title, children, right, id }) {
  return (
    <div data-testid={id ? `insights-${id}` : undefined}>
      <div className="flex items-end justify-between mb-2 gap-2">
        <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{title}</p>
        {right}
      </div>
      <Card className="p-3">{children}</Card>
    </div>
  );
}

function Legend({ items }) {
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-1 mb-2">
      {items.map(([label, color, line]) => (
        <span key={label} className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <span className={line ? "w-3 h-0.5 rounded" : "w-2.5 h-2.5 rounded-sm"} style={{ background: color }} />{label}
        </span>
      ))}
    </div>
  );
}

const tooltipStyle = { contentStyle: { borderRadius: 12, border: "1px solid hsl(var(--border))", background: "hsl(var(--card))", color: "hsl(var(--foreground))", fontSize: 12, padding: "6px 10px" }, labelStyle: { fontWeight: 600, marginBottom: 2 }, cursor: { fill: "hsl(var(--muted))", opacity: 0.5 } };
const axis = { tick: { fontSize: 11, fill: "hsl(var(--muted-foreground))" }, tickLine: false, axisLine: false };

// Horizontal bars with the value printed (no tooltip needed).
function BarList({ rows, testid, empty = "Nothing in this range" }) {
  if (!rows.length) return <p className="text-xs text-muted-foreground py-2">{empty}</p>;
  const max = Math.max(...rows.map(r => r.value), 1);
  return (
    <div className="space-y-2" data-testid={testid}>
      {rows.map(r => (
        <div key={r.key} className="flex items-center gap-2">
          <div className="w-28 shrink-0 min-w-0">
            <p className="text-xs text-foreground truncate">{r.label}</p>
            {r.sub && <p className="text-[10px] text-muted-foreground truncate">{r.sub}</p>}
          </div>
          <div className="flex-1 h-4 bg-muted/40 rounded overflow-hidden">
            <div className="h-full rounded" style={{ width: `${r.value > 0 ? Math.max((r.value / max) * 100, 3) : 0}%`, background: r.color || "var(--viz-1)" }} />
          </div>
          <span className="text-xs font-semibold w-[4.5rem] text-right shrink-0 tabular-nums">{formatCurrency(r.value)}</span>
        </div>
      ))}
    </div>
  );
}

export default function InsightsTab({ financeData }) {
  const [preset, setPreset] = useState("month");
  const today = todayET();
  const [custom, setCustom] = useState({ from: addDays(today, -29), to: today });
  const range = useMemo(() => rangeFor(preset, preset === "custom" ? custom : {}), [preset, custom]);
  const prevRange = useMemo(() => previousRange(range), [range]);
  const cur = useMemo(() => computeFinance(financeData || {}, range), [financeData, range]);
  const prev = useMemo(() => computeFinance(financeData || {}, prevRange), [financeData, prevRange]);
  const series = useMemo(() => computeSeries(financeData || {}, range), [financeData, range]);
  const [showTable, setShowTable] = useState(false);
  const unitWord = series.unit === "day" ? "day" : series.unit === "week" ? "week" : "month";

  return (
    <div className="space-y-4" data-testid="insights">
      {/* Range */}
      <div>
        <div className="flex gap-1.5 overflow-x-auto -mx-1 px-1 pb-1 scroll-hint-x" role="radiogroup" aria-label="Date range">
          {PRESETS.map(p => (
            <button key={p.value} type="button" role="radio" aria-checked={preset === p.value} onClick={() => setPreset(p.value)}
              data-testid={`range-${p.value}`}
              className={`shrink-0 min-h-[40px] px-3 rounded-lg text-xs font-semibold transition-colors ${preset === p.value ? "bg-primary text-white" : "bg-muted text-muted-foreground"}`}>
              {p.label}
            </button>
          ))}
        </div>
        {preset === "custom" && (
          <div className="grid grid-cols-2 gap-2 mt-2 form-row">
            <div><Label className="text-xs" htmlFor="ins-from">From</Label><Input id="ins-from" type="date" value={custom.from} max={custom.to} onChange={e => e.target.value && setCustom(c => ({ ...c, from: e.target.value }))} className="mt-1" /></div>
            <div><Label className="text-xs" htmlFor="ins-to">To</Label><Input id="ins-to" type="date" value={custom.to} min={custom.from} onChange={e => e.target.value && setCustom(c => ({ ...c, to: e.target.value }))} className="mt-1" /></div>
          </div>
        )}
        <p className="text-[11px] text-muted-foreground mt-1.5" data-testid="insights-range">
          {range.label}{prevRange ? <> · compared with {prevRange.label}</> : null}
        </p>
      </div>

      {/* Headline numbers */}
      <div className="grid grid-cols-2 gap-2">
        <Kpi id="revenue" label="Revenue" value={formatCurrency(cur.revenue)} cur={cur.revenue} prev={prev.revenue} goodWhenUp sub={cur.warranty ? `incl. ${money0(cur.warranty)} warranty` : null} />
        <Kpi id="expenses" label="Expenses" value={formatCurrency(cur.expenses)} cur={cur.expenses} prev={prev.expenses} goodWhenUp={false} />
        <Kpi id="net" label="Net profit" value={formatCurrency(cur.net)} cur={cur.net} prev={prev.net} goodWhenUp sub={cur.margin != null ? `${cur.margin.toFixed(0)}% margin` : null} />
        <Kpi id="jobs" label="Jobs completed" value={cur.jobsCompleted} cur={cur.jobsCompleted} prev={prev.jobsCompleted} goodWhenUp />
        <Kpi id="ticket" label="Average ticket" value={formatCurrency(cur.avgTicket)} cur={cur.avgTicket} prev={prev.avgTicket} goodWhenUp sub={`${cur.paidInvoices} paid`} />
        <Kpi id="warranty" label="Warranty reimbursed" value={formatCurrency(cur.warranty)} cur={cur.warranty} prev={prev.warranty} goodWhenUp sub={`${cur.warrantyClaims} claim${cur.warrantyClaims !== 1 ? "s" : ""}`} />
        <Kpi id="tax" label="NJ sales tax collected" value={formatCurrency(cur.tax)} cur={cur.tax} prev={prev.tax} goodWhenUp />
        <Kpi id="parts" label="Parts used (cost)" value={formatCurrency(cur.partsSpend)} cur={cur.partsSpend} prev={prev.partsSpend} goodWhenUp={false} />
      </div>

      <Section id="trend" title={`Revenue, expenses & profit by ${unitWord}`}
        right={<button type="button" className="text-[11px] font-semibold text-primary min-h-[32px]" onClick={() => setShowTable(v => !v)}>{showTable ? "Chart" : "Table"}</button>}>
        {showTable ? (
          <table className="w-full text-xs tabular-nums" data-testid="trend-table">
            <thead><tr className="text-muted-foreground"><th className="text-left font-semibold py-1">{unitWord[0].toUpperCase() + unitWord.slice(1)}</th><th className="text-right font-semibold">Revenue</th><th className="text-right font-semibold">Expenses</th><th className="text-right font-semibold">Profit</th></tr></thead>
            <tbody>{series.points.map(p => <tr key={p.from} className="border-t border-border/60"><td className="py-1">{p.label}</td><td className="text-right">{money0(p.revenue)}</td><td className="text-right">{money0(p.expenses)}</td><td className="text-right">{money0(p.profit)}</td></tr>)}</tbody>
          </table>
        ) : (
          <>
            <Legend items={[["Revenue", "var(--viz-1)"], ["Expenses", "var(--viz-2)"], ["Profit", "var(--viz-3)", true]]} />
            <div className="h-48 -ml-2" data-testid="trend-chart">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={series.points} barGap={2} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                  <CartesianGrid vertical={false} stroke="hsl(var(--border))" strokeOpacity={0.6} />
                  <XAxis dataKey="label" {...axis} interval="preserveStartEnd" minTickGap={12} />
                  <YAxis {...axis} width={44} tickFormatter={moneyAxis} />
                  <Tooltip {...tooltipStyle} formatter={(v, n) => [formatCurrency(v), n]} />
                  <Bar dataKey="revenue" name="Revenue" fill="var(--viz-1)" radius={[4, 4, 0, 0]} maxBarSize={18} />
                  <Bar dataKey="expenses" name="Expenses" fill="var(--viz-2)" radius={[4, 4, 0, 0]} maxBarSize={18} />
                  <Line dataKey="profit" name="Profit" type="monotone" stroke="var(--viz-3)" strokeWidth={2} dot={{ r: 3, strokeWidth: 0, fill: "var(--viz-3)" }} activeDot={{ r: 5 }} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </>
        )}
      </Section>

      <Section id="jobs" title={`Jobs completed by ${unitWord}`}>
        <div className="h-36 -ml-2" data-testid="jobs-chart">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={series.points} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
              <CartesianGrid vertical={false} stroke="hsl(var(--border))" strokeOpacity={0.6} />
              <XAxis dataKey="label" {...axis} interval="preserveStartEnd" minTickGap={12} />
              <YAxis {...axis} width={28} allowDecimals={false} />
              <Tooltip {...tooltipStyle} formatter={(v) => [v, "Jobs"]} />
              <Bar dataKey="jobs" name="Jobs" fill="var(--viz-1)" radius={[4, 4, 0, 0]} maxBarSize={22} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Section>

      <Section id="customers" title="Customers: new vs returning" right={<span className="text-[11px] text-muted-foreground">{cur.customersServed} paid · {cur.newCustomers} new</span>}>
        <Legend items={[["New", "var(--viz-1)"], ["Returning", "var(--viz-3)"]]} />
        <div className="h-36 -ml-2" data-testid="customers-chart">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={series.points} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
              <CartesianGrid vertical={false} stroke="hsl(var(--border))" strokeOpacity={0.6} />
              <XAxis dataKey="label" {...axis} interval="preserveStartEnd" minTickGap={12} />
              <YAxis {...axis} width={28} allowDecimals={false} />
              <Tooltip {...tooltipStyle} />
              <Bar dataKey="newCustomers" name="New" stackId="c" fill="var(--viz-1)" maxBarSize={22} stroke="hsl(var(--card))" strokeWidth={1} />
              <Bar dataKey="returningCustomers" name="Returning" stackId="c" fill="var(--viz-3)" radius={[4, 4, 0, 0]} maxBarSize={22} stroke="hsl(var(--card))" strokeWidth={1} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Section>

      <Section id="by-type" title="Revenue by job type">
        <BarList testid="insights-by-type" rows={cur.byJobType.map(t => ({ key: t.type, label: t.label, sub: `${t.count} ${t.type === "warranty" ? "claim" : "invoice"}${t.count !== 1 ? "s" : ""}`, value: t.revenue }))} />
      </Section>

      <Section id="by-tech" title="Revenue by tech">
        <BarList testid="insights-by-tech" rows={cur.byTech.map(t => ({ key: t.tech, label: t.tech, sub: `${t.count} invoice${t.count !== 1 ? "s" : ""}`, value: t.revenue }))} empty="No paid invoices in this range" />
      </Section>

      <Section id="methods" title="Payments by method">
        <BarList testid="insights-methods" rows={cur.byPaymentMethod.map(m => ({ key: m.method, label: m.label, sub: `${m.count} payment${m.count !== 1 ? "s" : ""}`, value: m.amount }))} />
      </Section>

      <Section id="spend" title="Parts used & expenses by category">
        <BarList testid="insights-spend" rows={[
          { key: "parts", label: "Parts used on jobs", sub: "catalog cost", value: cur.partsSpend, color: "var(--viz-3)" },
          ...cur.expensesByCategory.map(e => ({ key: e.category, label: e.category, sub: `${e.count} expense${e.count !== 1 ? "s" : ""}`, value: e.amount, color: "var(--viz-2)" })),
        ].filter(r => r.value > 0 || r.key === "parts")} />
      </Section>

      <Section id="warranty" title={`Warranty reimbursements by ${unitWord}`} right={<span className="text-[11px] text-muted-foreground">{formatCurrency(cur.warranty)}</span>}>
        <div className="h-32 -ml-2" data-testid="warranty-chart">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={series.points} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
              <CartesianGrid vertical={false} stroke="hsl(var(--border))" strokeOpacity={0.6} />
              <XAxis dataKey="label" {...axis} interval="preserveStartEnd" minTickGap={12} />
              <YAxis {...axis} width={44} tickFormatter={moneyAxis} />
              <Tooltip {...tooltipStyle} formatter={(v) => [formatCurrency(v), "Warranty"]} />
              <Bar dataKey="warranty" name="Warranty" fill="var(--viz-7)" radius={[4, 4, 0, 0]} maxBarSize={22} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Section>

      <div className="grid grid-cols-2 gap-2">
        <Kpi id="agreements" label="Agreements sold" value={cur.agreementsSold} cur={cur.agreementsSold} prev={prev.agreementsSold} goodWhenUp sub={cur.agreementRevenue ? `${money0(cur.agreementRevenue)} billed` : null} />
        <Kpi id="members" label="Active members" value={cur.activeMembers} cur={cur.activeMembers} prev={prev.activeMembers} goodWhenUp sub={`at ${range.to.slice(5).replace("-", "/")}`} />
        <Kpi id="surcharge" label="Card surcharges" value={formatCurrency(cur.surcharge)} cur={cur.surcharge} prev={prev.surcharge} goodWhenUp sub="in revenue" />
        <Kpi id="customers" label="Customers paid" value={cur.customersServed} cur={cur.customersServed} prev={prev.customersServed} goodWhenUp sub={`${cur.returningCustomers} returning`} />
      </div>
      <p className="text-[10px] text-muted-foreground leading-relaxed">
        Revenue = paid invoices (incl. NJ tax and card surcharges) + warranty reimbursements, by the day they were paid (New York time). Same numbers as Overview and the weekly report email.
      </p>
    </div>
  );
}
