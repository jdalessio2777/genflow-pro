import { describe, it, expect } from "vitest";
import { stockStatus, stockAlertText } from "@/lib/utils/stockStatus";

describe("Decision 3: negative stock means Recount", () => {
  it("classifies counts", () => {
    expect(stockStatus(-1)).toBe("recount");
    expect(stockStatus(0)).toBe("out");
    expect(stockStatus(2)).toBe("low");
    expect(stockStatus(3)).toBe("ok");
    expect(stockStatus(null)).toBe("unknown");
  });
  it("dashboard alert puts recount first and never calls it 'low'", () => {
    expect(stockAlertText([{ in_stock: -2 }, { in_stock: 1 }])).toBe("1 part needs a recount");
    expect(stockAlertText([{ in_stock: -2 }, { in_stock: -1 }, { in_stock: 0 }])).toBe("2 parts need a recount · 1 part out of stock");
    expect(stockAlertText([{ in_stock: 1 }, { in_stock: 2 }])).toBe("2 parts running low");
  });
});

describe("stockShortText (Add Part search)", () => {
  it("negative stock reads Recount, never '-2 in stock'", async () => {
    const { stockShortText } = await import("../lib/utils/stockStatus.js");
    expect(stockShortText(-2)).toBe("Recount");
    expect(stockShortText(-1)).toBe("Recount");
    expect(stockShortText(0)).toBe("0 in stock");
    expect(stockShortText(5)).toBe("5 in stock");
    expect(stockShortText(null)).toBe("0 in stock");
  });
});
