import { Card } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils/format";

export default function JobCostSummary({ parts, labor }) {
  const partsCost = parts.reduce((s, p) => s + (p.total_cost || 0), 0);
  const partsPrice = parts.reduce((s, p) => s + (p.total_price || 0), 0);
  const laborCost = labor.reduce((s, l) => s + (l.total_cost || 0), 0);
  const laborPrice = labor.reduce((s, l) => s + (l.total_price || 0), 0);
  const totalCost = partsCost + laborCost;
  const totalPrice = partsPrice + laborPrice;
  const profit = totalPrice - totalCost;
  const margin = totalPrice > 0 ? (profit / totalPrice) * 100 : 0;

  return (
    <Card className="p-4">
      <h3 className="text-sm font-semibold mb-3">Job Cost Summary</h3>
      <div className="space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Parts</span>
          <span>{formatCurrency(partsPrice)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Labor</span>
          <span>{formatCurrency(laborPrice)}</span>
        </div>
        <div className="border-t pt-2 flex justify-between font-semibold">
          <span>Total</span>
          <span>{formatCurrency(totalPrice)}</span>
        </div>
        <div className="flex justify-between text-xs">
          <span className="text-muted-foreground">Cost: {formatCurrency(totalCost)}</span>
          <span className={profit >= 0 ? "text-green-600" : "text-destructive"}>
            Profit: {formatCurrency(profit)} ({margin.toFixed(0)}%)
          </span>
        </div>
      </div>
    </Card>
  );
}